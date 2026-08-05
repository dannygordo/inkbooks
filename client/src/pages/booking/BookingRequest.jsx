import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import { gql, useMutation, useQuery } from "@apollo/client";
import "./bookingRequest.css";
import { APP_SETTINGS_CONSTANTS } from "../../constants";

// Same import.meta.env.MODE-scoped lookup index.js/SocketProvider.js already use for the
// GraphQL endpoint (see index.js's comment on why this replaced process.env.NODE_ENV under
// Vite) - /booking-uploads is a plain Express route on that same server, not a separate host,
// so it reuses GRAPHQL_SERVER_URL rather than introducing a second env-specific constant.
const UPLOAD_URL =
  APP_SETTINGS_CONSTANTS[import.meta.env.MODE.toUpperCase()].GRAPHQL_SERVER_URL + "booking-uploads";

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
  const placement = useRef();
  const size = useRef();
  const budget = useRef();
  const availability = useRef();
  const howHeard = useRef();
  const isCoverUp = useRef();
  const fileInput = useRef();

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
          placement: placement.current.value || null,
          size: size.current.value || null,
          budget: budget.current.value || null,
          availability: availability.current.value || null,
          isCoverUp: isCoverUp.current.checked,
          howHeard: howHeard.current.value || null,
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
          <input placeholder="Placement (e.g. forearm)" ref={placement} className="bookingRequestInput" />
          <input placeholder="Size (e.g. 4in x 6in)" ref={size} className="bookingRequestInput" />
          <input placeholder="Budget range" ref={budget} className="bookingRequestInput" />
          <input placeholder="Availability" ref={availability} className="bookingRequestInput" />
          <input placeholder="How did you hear about us?" ref={howHeard} className="bookingRequestInput" />
          <label className="bookingRequestCheckbox">
            <input type="checkbox" ref={isCoverUp} />
            This is a cover-up or touch-up
          </label>

          <div className="bookingRequestUpload">
            <label className="bookingRequestUploadLabel">
              Reference images (optional, up to 5)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              ref={fileInput}
              onChange={handleFileChange}
            />
            {selectedFiles.length > 0 && (
              <div className="bookingRequestFileList">
                {selectedFiles.length} file(s) selected
              </div>
            )}
            {uploadError && <div className="bookingRequestFieldError">{uploadError}</div>}
          </div>

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
