import { useRef, useState } from "react";
import { gql, useMutation, useQuery } from "@apollo/client";
import { CircularProgress } from "@mui/material";
import { useAuth } from "../../context/auth";
import { ArtistService } from "../../services/ArtistService";
import "./artistBookingRequests.css";

const GET_BOOKING_REQUESTS = gql`
  query getBookingRequests($artistId: ID!) {
    getBookingRequests(artistId: $artistId) {
      id
      status
      description
      placement
      size
      budget
      availability
      isCoverUp
      howHeard
      referenceImages
      createdAt
      client {
        firstName
        lastName
        email
        phone
      }
      conversation {
        id
        messages {
          id
          senderId
          message
          createdAt
        }
      }
    }
  }
`;

const CREATE_MESSAGE = gql`
  mutation createMessage(
    $conversationId: ID!
    $senderId: ID!
    $message: String!
    $createdAt: DateTime
    $updatedAt: DateTime
  ) {
    createMessage(
      conversationId: $conversationId
      senderId: $senderId
      message: $message
      createdAt: $createdAt
      updatedAt: $updatedAt
    ) {
      id
    }
  }
`;

const CONVERT_BOOKING_REQUEST = gql`
  mutation convertBookingRequest(
    $bookingRequestId: ID!
    $outcome: String!
    $appointmentInput: AppointmentInput
    $projectTitle: String
  ) {
    convertBookingRequest(
      bookingRequestId: $bookingRequestId
      outcome: $outcome
      appointmentInput: $appointmentInput
      projectTitle: $projectTitle
    ) {
      id
      status
      resultingAppointmentId
    }
  }
`;

// See server/graphql/mutations/bookingRequests.js's reassignBookingRequest - only allowed between
// two artists actively connected to the same shop.
const REASSIGN_BOOKING_REQUEST = gql`
  mutation reassignBookingRequest($bookingRequestId: ID!, $newArtistId: ID!) {
    reassignBookingRequest(bookingRequestId: $bookingRequestId, newArtistId: $newArtistId) {
      id
      artistId
      status
    }
  }
`;

const STATUS_LABELS = {
  pending: "Pending",
  consult_booked: "Consult booked",
  session_booked: "Session booked",
  declined: "Declined",
};

const ArtistBookingRequests = () => {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState(null);
  const [replyError, setReplyError] = useState(null);
  const [convertError, setConvertError] = useState(null);
  // Which outcome's date/time sub-form is currently open ('consult_booked' | 'session_booked' | null)
  const [pendingOutcome, setPendingOutcome] = useState(null);
  const [showReassignPicker, setShowReassignPicker] = useState(false);
  const messageInput = useRef();
  const appointmentDateInput = useRef();
  const projectTitleInput = useRef();

  const shopId = user.userInfo?.shop?.id;

  const { data, loading, error, refetch } = useQuery(GET_BOOKING_REQUESTS, {
    variables: { artistId: user.id },
  });

  // Only meaningful when the caller has a shop - an independent artist has no shop-mates to
  // forward a request to. Reuses the same skip-guarded query the calendar's artist filter
  // already relies on (see ibCalendar/Sidebar.jsx).
  const { data: shopArtistsData } = ArtistService.fetchArtistsByShop(shopId);
  const otherShopArtists = (shopArtistsData?.getArtistsByShop || []).filter(
    (a) => String(a.user?.id) !== String(user.id)
  );

  const [createMessage, { loading: sending }] = useMutation(CREATE_MESSAGE, {
    onCompleted() {
      messageInput.current.value = "";
      setReplyError(null);
      refetch();
    },
    onError(err) {
      setReplyError(err.graphQLErrors?.[0]?.message || err.message);
    },
  });

  const [convertBookingRequest, { loading: converting }] = useMutation(CONVERT_BOOKING_REQUEST, {
    onCompleted() {
      setConvertError(null);
      setPendingOutcome(null);
      refetch();
    },
    onError(err) {
      setConvertError(err.graphQLErrors?.[0]?.message || err.message);
    },
  });

  const [reassignBookingRequest, { loading: reassigning }] = useMutation(
    REASSIGN_BOOKING_REQUEST,
    {
      onCompleted() {
        setConvertError(null);
        setShowReassignPicker(false);
        refetch();
      },
      onError(err) {
        setConvertError(err.graphQLErrors?.[0]?.message || err.message);
      },
    }
  );

  if (loading) {
    return (
      <div className="artistBookingRequests">
        <CircularProgress color="inherit" size="30px" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="artistBookingRequests">
        <p>Couldn't load booking requests: {error.message}</p>
      </div>
    );
  }

  const requests = data?.getBookingRequests || [];
  const selected = requests.find((r) => r.id === selectedId) || requests[0];

  const handleReply = (e) => {
    e.preventDefault();
    const message = messageInput.current.value.trim();
    if (!message || !selected) {
      return;
    }
    const now = new Date().toISOString();
    createMessage({
      variables: {
        conversationId: selected.conversation.id,
        senderId: user.id,
        message,
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  const handleDecline = () => {
    if (!selected) return;
    if (!window.confirm("Decline this booking request? This can't be undone.")) {
      return;
    }
    convertBookingRequest({
      variables: { bookingRequestId: selected.id, outcome: "declined" },
    });
  };

  const handleConfirmConversion = (e) => {
    e.preventDefault();
    if (!selected || !pendingOutcome) return;
    const rawDate = appointmentDateInput.current.value;
    if (!rawDate) {
      setConvertError("Pick a date and time first.");
      return;
    }
    // Booking a session now auto-creates a real Project from this request's own intake fields
    // (see server/graphql/mutations/bookingRequests.js) - Project.title is required and
    // BookingRequest never collects one, so it has to come from here.
    let projectTitle;
    if (pendingOutcome === "session_booked") {
      projectTitle = projectTitleInput.current?.value.trim();
      if (!projectTitle) {
        setConvertError("Give the project a title first.");
        return;
      }
    }
    convertBookingRequest({
      variables: {
        bookingRequestId: selected.id,
        outcome: pendingOutcome,
        // shopCutStatus/appointmentStatus are sensible defaults for a freshly-booked
        // consult/session, not something worth a form field for yet - both are editable
        // afterward from the regular Appointments views like any other appointment.
        appointmentInput: {
          appointmentDate: new Date(rawDate).toISOString(),
          shopCutStatus: "unpaid",
          appointmentStatus: "scheduled",
        },
        projectTitle,
      },
    });
  };

  const handleReassign = (e) => {
    const newArtistId = e.target.value;
    if (!newArtistId || !selected) return;
    if (
      !window.confirm(
        "Forward this booking request to that artist? You won't see it here anymore."
      )
    ) {
      return;
    }
    reassignBookingRequest({
      variables: { bookingRequestId: selected.id, newArtistId },
    });
  };

  return (
    <div className="artistBookingRequests">
      <div className="bookingRequestsList">
        <h3 className="bookingRequestsListTitle">Booking Requests</h3>
        {requests.length === 0 && (
          <div className="bookingRequestsEmpty">No booking requests yet.</div>
        )}
        {requests.map((req) => (
          <div
            key={req.id}
            className={
              selected?.id === req.id
                ? "bookingRequestsListItem bookingRequestsListItemSelected"
                : "bookingRequestsListItem"
            }
            onClick={() => {
              setSelectedId(req.id);
              setPendingOutcome(null);
              setConvertError(null);
              setReplyError(null);
            }}
          >
            <div className="bookingRequestsListItemHeader">
              <span className="bookingRequestsListItemName">
                {req.client?.firstName} {req.client?.lastName}
              </span>
              <span className="bookingRequestsListItemStatus">
                {STATUS_LABELS[req.status] || req.status}
              </span>
            </div>
            <div className="bookingRequestsListItemSnippet">{req.description}</div>
          </div>
        ))}
      </div>

      <div className="bookingRequestDetail">
        {!selected ? (
          <div className="bookingRequestDetailEmpty">Select a request to view it.</div>
        ) : (
          <>
            <div className="bookingRequestDetailHeader">
              <h3>
                {selected.client?.firstName} {selected.client?.lastName}
              </h3>
              <span className="bookingRequestsListItemStatus">
                {STATUS_LABELS[selected.status] || selected.status}
              </span>
            </div>
            <div className="bookingRequestDetailContact">
              {selected.client?.email} {selected.client?.phone ? `· ${selected.client.phone}` : ""}
            </div>

            <div className="bookingRequestDetailFields">
              <p>{selected.description}</p>
              {selected.placement && <span>Placement: {selected.placement}</span>}
              {selected.size && <span>Size: {selected.size}</span>}
              {selected.budget && <span>Budget: {selected.budget}</span>}
              {selected.availability && <span>Availability: {selected.availability}</span>}
              {selected.isCoverUp && <span>Cover-up / touch-up</span>}
              {selected.howHeard && <span>Heard about us: {selected.howHeard}</span>}
            </div>

            {selected.referenceImages && selected.referenceImages.length > 0 && (
              <div className="bookingRequestDetailImages">
                {selected.referenceImages.map((url) => (
                  <a href={url} target="_blank" rel="noreferrer" key={url}>
                    <img src={url} alt="Reference" className="bookingRequestDetailImage" />
                  </a>
                ))}
              </div>
            )}

            {selected.status === "pending" && (
              <div className="bookingRequestDetailActions">
                <button
                  className="bookingRequestActionButton"
                  onClick={() => {
                    setPendingOutcome("consult_booked");
                    setConvertError(null);
                  }}
                  disabled={converting}
                >
                  Book Consult
                </button>
                <button
                  className="bookingRequestActionButton"
                  onClick={() => {
                    setPendingOutcome("session_booked");
                    setConvertError(null);
                  }}
                  disabled={converting}
                >
                  Book Session
                </button>
                <button
                  className="bookingRequestActionButtonDecline"
                  onClick={handleDecline}
                  disabled={converting}
                >
                  Decline
                </button>
                {/* Only offered when the artist actually has shop-mates to forward to - an
                    independent artist, or one at a shop with no one else connected, has no one
                    to hand this off to. */}
                {otherShopArtists.length > 0 && (
                  <button
                    className="bookingRequestActionButton"
                    onClick={() => setShowReassignPicker((v) => !v)}
                    disabled={converting || reassigning}
                  >
                    Forward to...
                  </button>
                )}
              </div>
            )}

            {showReassignPicker && (
              <div className="bookingRequestConvertForm">
                <label>Forward to</label>
                <select defaultValue="" onChange={handleReassign} disabled={reassigning}>
                  <option value="" disabled>
                    Choose an artist
                  </option>
                  {otherShopArtists.map((a) => (
                    <option key={a.id} value={a.user.id}>
                      {a.user.firstName} {a.user.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {pendingOutcome && (
              <form className="bookingRequestConvertForm" onSubmit={handleConfirmConversion}>
                <label>
                  {pendingOutcome === "consult_booked" ? "Consult" : "Session"} date & time
                </label>
                <input type="datetime-local" ref={appointmentDateInput} required />
                {pendingOutcome === "session_booked" && (
                  <>
                    <label>Project title</label>
                    <input type="text" ref={projectTitleInput} placeholder="e.g. Sleeve piece" required />
                  </>
                )}
                <div className="bookingRequestConvertFormButtons">
                  <button type="submit" disabled={converting}>
                    {converting ? <CircularProgress color="inherit" size="16px" /> : "Confirm"}
                  </button>
                  <button type="button" onClick={() => setPendingOutcome(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {convertError && <div className="bookingRequestError">{convertError}</div>}

            <div className="bookingRequestConversation">
              {(selected.conversation?.messages || []).map((msg) => (
                <div
                  key={msg.id}
                  className={
                    String(msg.senderId) === String(user.id)
                      ? "guestMessage guestMessageMine"
                      : "guestMessage guestMessageTheirs"
                  }
                >
                  <div className="guestMessageBubble">{msg.message}</div>
                </div>
              ))}
            </div>
            <form className="bookingRequestReplyRow" onSubmit={handleReply}>
              <input placeholder="Write a reply..." ref={messageInput} />
              <button type="submit" disabled={sending}>
                {sending ? <CircularProgress color="inherit" size="16px" /> : "Send"}
              </button>
            </form>
            {replyError && <div className="bookingRequestError">{replyError}</div>}
          </>
        )}
      </div>
    </div>
  );
};

export default ArtistBookingRequests;
