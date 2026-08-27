import React, { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import { gql, useMutation, useQuery } from "@apollo/client";
import "./bookingRequest.css";
import { apiUrl } from "../../utils/apiUrl";
import FormService from "../../services/FormService";

// The fixed, non-extensible set of BookingRequestInput's optional slots (server/graphql/
// typeDefs.js) - order/label/required/hidden here is only ever the FALLBACK, used when the
// booking_request system form's own config (fetched below via getPublicFormBySlug) hasn't loaded
// or doesn't exist yet for some reason (e.g. an account that predates this feature and hasn't run
// the migration - see server/scripts/migrate-seed-default-forms.js). createBookingRequest itself
// never sees or cares about this array; it always takes the same six named arguments it always
// has (see handleSubmit below) - this only decides what's SHOWN, and in what order.
const DEFAULT_BOOKING_FIELDS = [
	{ key: "placement", label: "Placement (e.g. forearm)", required: false, hidden: false },
	{ key: "size", label: "Size (e.g. 4in x 6in)", required: false, hidden: false },
	{ key: "budget", label: "Budget range", required: false, hidden: false },
	{ key: "availability", label: "Availability", required: false, hidden: false },
	{ key: "howHeard", label: "How did you hear about us?", required: false, hidden: false },
	{ key: "isCoverUp", label: "This is a cover-up or touch-up", required: false, hidden: false },
	{ key: "referenceImages", label: "Reference images (optional, up to 5)", required: false, hidden: false },
];

// /booking-uploads is a plain Express route on the same server as GraphQL, not a separate host,
// so it reuses that base rather than introducing a second env-specific constant.
//
// Resolved through apiUrl() rather than indexing APP_SETTINGS_CONSTANTS directly: that object has
// only PRODUCTION and DEVELOPMENT keys, so the direct lookup throws under any other Vite mode -
// including "test". At module level that is an IMPORT-time crash, which takes down every test that
// transitively imports this page. It hadn't bitten here yet only because nothing imported it.
const UPLOAD_URL = apiUrl("booking-uploads");

// The argument is still named artistId server-side, but it accepts either a bookingSlug or a raw
// artist id - see getPublicArtistProfile in server/graphql/resolvers/bookingRequests.js. `id` in
// the selection is what matters below: whatever the URL carried, the booking request itself must
// be submitted against the artist's real id.
const GET_PUBLIC_ARTIST_PROFILE = gql`
  query getPublicArtistProfile($artistHandle: ID!) {
    getPublicArtistProfile(artistId: $artistHandle) {
      id
      firstName
      lastName
      avatar
      bookingSlug
      archived
    }
  }
`;

const CREATE_BOOKING_REQUEST = gql`
  mutation createBookingRequest($bookingRequestInput: BookingRequestInput!) {
    createBookingRequest(bookingRequestInput: $bookingRequestInput) {
      id
      status
    }
  }
`;

// Uploads any selected files to the server BEFORE createBookingRequest runs, since a guest has
// no User/Client record (and therefore no userId) until that mutation itself creates one - see
// PRODUCTION_ROADMAP.md's "Guest reference-image upload" note. Returns [] if no files were
// selected, so callers don't need to special-case "no images" separately.
async function uploadReferenceImages(files) {
  if (!files || files.length === 0) {
    return [];
  }
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const response = await fetch(UPLOAD_URL, { method: "POST", body: formData });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to upload reference images.");
  }
  return data.urls || [];
}

const BookingRequest = () => {
  // Either a slug (/book/maya-chen) or a raw artist id (/book/<objectId>, for links handed out
  // before slugs existed). Deliberately NOT called artistId: it usually isn't one, and treating
  // it as one is exactly the mistake that would send a slug to createBookingRequest.
  const { artistHandle } = useParams();

  const firstName = useRef();
  const lastName = useRef();
  const email = useRef();
  const phone = useRef();
  const description = useRef();
  const fileInput = useRef();

  // The six optional slots' current values, keyed the same way the booking_request Form's own
  // field.key values are (see typeDefs.js's BookingRequestInput) - state rather than refs, since
  // which of these actually render, and in what order, is itself dynamic (see fieldsToRender
  // below), which plain DOM refs don't handle cleanly.
  const [answers, setAnswers] = useState({
    placement: "",
    size: "",
    budget: "",
    availability: "",
    howHeard: "",
    isCoverUp: false,
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    data: artistData,
    loading: artistLoading,
    error: artistError,
  } = useQuery(GET_PUBLIC_ARTIST_PROFILE, {
    variables: { artistHandle },
    skip: !artistHandle,
  });

  // The booking_request system form's own display config (order/labels/required/hidden) - see
  // models/Form.js's own comment on why this exists despite the pipeline itself being untouched.
  // Deliberately best-effort: a missing/unpublished/unreadable config here falls back to
  // DEFAULT_BOOKING_FIELDS above rather than blocking the page - a booking request must never
  // fail to load just because nobody has visited Settings > Forms yet.
  const { data: fieldsData } = useQuery(FormService.GET_PUBLIC_FORM_BY_SLUG, {
    variables: { formSlug: "book", ownerHandle: artistHandle },
    skip: !artistHandle,
  });
  const fetchedFields = fieldsData?.getPublicFormBySlug;
  const fieldsToRender =
    fetchedFields?.state === "ok" && fetchedFields.form?.fields?.length
      ? fetchedFields.form.fields
      : DEFAULT_BOOKING_FIELDS;
  const visibleFields = fieldsToRender.filter((f) => !f.hidden);

  const [createBookingRequest, { loading: submitting }] = useMutation(CREATE_BOOKING_REQUEST, {
    onCompleted() {
      setSubmitted(true);
    },
    onError(err) {
      const extensions = err.graphQLErrors?.[0]?.extensions;
      if (extensions?.errors) {
        setErrors(extensions.errors);
      } else {
        // Rate-limit errors (extensions.code === 'RATE_LIMITED') and anything else unexpected
        // don't carry a field-keyed `errors` object - just surface the message directly.
        setErrors({ general: err.graphQLErrors?.[0]?.message || err.message });
      }
    },
  });

  const handleFileChange = (e) => {
    setSelectedFiles([...e.target.files]);
    setUploadError(null);
  };

  const setAnswer = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));

  // Dispatches purely on `key`, never on anything the config itself controls (type isn't even
  // read from it) - the six slots plus referenceImages are the only keys this ever sees, matching
  // BookingRequestInput exactly. label/required come from config (or DEFAULT_BOOKING_FIELDS);
  // everything about HOW each one renders is still fixed here, on purpose - see this file's own
  // header comment.
  const renderField = (field) => {
    if (field.key === "isCoverUp") {
      return (
        <label className="bookingRequestCheckbox" key={field.key}>
          <input
            type="checkbox"
            checked={answers.isCoverUp}
            onChange={(e) => setAnswer("isCoverUp", e.target.checked)}
          />
          {field.label}
        </label>
      );
    }
    if (field.key === "referenceImages") {
      return (
        <div className="bookingRequestUpload" key={field.key}>
          <label className="bookingRequestUploadLabel">{field.label}</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            ref={fileInput}
            onChange={handleFileChange}
          />
          {selectedFiles.length > 0 && (
            <div className="bookingRequestFileList">{selectedFiles.length} file(s) selected</div>
          )}
          {uploadError && <div className="bookingRequestFieldError">{uploadError}</div>}
        </div>
      );
    }
    // placement / size / budget / availability / howHeard - the only keys left.
    return (
      <input
        key={field.key}
        placeholder={field.label}
        className="bookingRequestInput"
        value={answers[field.key] || ""}
        onChange={(e) => setAnswer(field.key, e.target.value)}
        required={Boolean(field.required)}
      />
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setUploadError(null);

    let referenceImages = [];
    if (selectedFiles.length > 0) {
      setUploading(true);
      try {
        referenceImages = await uploadReferenceImages(selectedFiles);
      } catch (err) {
        setUploadError(err.message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    createBookingRequest({
      variables: {
        bookingRequestInput: {
          // The RESOLVED id, never the URL param. When the link is a slug, artistHandle is
          // "maya-chen" - submitting that as artistId would fail ObjectId coercion at best and
          // attach the request to nothing at worst.
          artistId: artistData?.getPublicArtistProfile?.id,
          firstName: firstName.current.value,
          lastName: lastName.current.value,
          email: email.current.value,
          phone: phone.current.value || null,
          description: description.current.value,
          referenceImages,
          // Always sent, regardless of which of these six actually rendered - a HIDDEN field is
          // hidden, not removed, so it's simply omitted from what the guest could have filled in
          // and reaches createBookingRequest as null/false, the same as it always has when a
          // guest just left one blank. This is the one place createBookingRequest's own six
          // argument names are still spelled out explicitly, on purpose - see this file's own
          // header comment on why nothing about the mutation itself is dynamic.
          placement: answers.placement || null,
          size: answers.size || null,
          budget: answers.budget || null,
          availability: answers.availability || null,
          isCoverUp: answers.isCoverUp,
          howHeard: answers.howHeard || null,
        },
      },
    });
  };

  if (!artistHandle) {
    return (
      <div className="bookingRequest">
        <div className="bookingRequestWrapper">
          <p>This booking link is missing an artist. Double-check the link and try again.</p>
        </div>
      </div>
    );
  }

  if (artistLoading) {
    return (
      <div className="bookingRequest">
        <div className="bookingRequestWrapper">
          <CircularProgress color="inherit" size="30px" />
        </div>
      </div>
    );
  }

  if (artistError || !artistData?.getPublicArtistProfile) {
    return (
      <div className="bookingRequest">
        <div className="bookingRequestWrapper">
          <p>We couldn't find this artist. Double-check the link and try again.</p>
        </div>
      </div>
    );
  }

  const artist = artistData.getPublicArtistProfile;

  // Task #165: an artist who once existed but has since been archived reads differently than a
  // plain dead link - see typeDefs.js's PublicArtistProfile.archived comment. Checked before
  // `submitted` deliberately can't happen for an archived artist (createBookingRequest still runs
  // its own createArtist/status checks - not reached here at all before this early return).
  if (artist.archived) {
    return (
      <div className="bookingRequest">
        <div className="bookingRequestWrapper">
          <p>This artist is no longer on the platform.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bookingRequest">
        <div className="bookingRequestWrapper">
          <h3 className="bookingRequestLogo">Request sent</h3>
          <p className="bookingRequestDesc">
            Thanks, {firstName.current?.value || "there"} - your request has been sent to{" "}
            {artist.firstName}. Check your email for a link to view and continue this
            conversation - no account needed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bookingRequest">
      <div className="bookingRequestWrapper">
        <h3 className="bookingRequestLogo">
          Book with {artist.firstName} {artist.lastName}
        </h3>
        <span className="bookingRequestDesc">
          Tell {artist.firstName} about the piece you have in mind. No account needed - you'll
          get an email with a link to view and continue this conversation.
        </span>
        <form className="bookingRequestBox" onSubmit={handleSubmit}>
          <input placeholder="First Name" ref={firstName} className="bookingRequestInput" required />
          <input placeholder="Last Name" ref={lastName} className="bookingRequestInput" required />
          <input placeholder="Email" type="email" ref={email} className="bookingRequestInput" required />
          <input placeholder="Phone (optional)" ref={phone} className="bookingRequestInput" />
          <textarea
            placeholder="Describe what you have in mind"
            ref={description}
            className="bookingRequestTextarea"
            required
          />
          {visibleFields.map((field) => renderField(field))}

          <button className="bookingRequestButton" type="submit" disabled={uploading || submitting}>
            {uploading ? "Uploading images..." : submitting ? <CircularProgress color="inherit" size="20px" /> : "Send Request"}
          </button>
        </form>

        {Object.keys(errors).length > 0 && (
          <div className="errors">
            <ul className="list">
              {Object.values(errors).map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingRequest;
