import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gql, useMutation, useQuery } from "@apollo/client";
import { CircularProgress } from "@mui/material";
import moment from "moment";
import { useAuth } from "../../context/auth";
import { ArtistService } from "../../services/ArtistService";
import MessengerService from "../../services/MessengerService";
import IBDateTimePicker from "../../components/inputs/IBDateTimePicker";
import BookSessionDatesForm from "../../components/booking/BookSessionDatesForm";
import { prettyMessageTime, fullMessageTime } from "../../utils/messageTime";
import { ROUTE_CONSTANTS } from "../../constants";
import "./artistBookingRequests.css";

// Which statuses each filter asks the SERVER for. Closed requests are never loaded unless the
// artist actively asks for them - they are terminal, they accumulate for as long as someone keeps
// working, and an inbox that only grows stops being an inbox.
//
// `open` sends no statuses at all rather than listing the three open ones, so the default lives in
// exactly one place (the resolver). A list here would be a second copy, free to drift the first
// time a status is added.
const STATUS_FILTERS = {
  open: { label: "Open", statuses: undefined },
  closed: { label: "Declined & not booked", statuses: ["declined", "not_booked"] },
  all: {
    label: "All",
    statuses: ["pending", "consult_booked", "session_booked", "declined", "not_booked"],
  },
};

const GET_BOOKING_REQUESTS = gql`
  query getBookingRequests($artistId: ID!, $statuses: [String!]) {
    getBookingRequests(artistId: $artistId, statuses: $statuses) {
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
      # No messages field here, deliberately - see the matching note in MessengerService. Pulling
      # every message of every request to render a list of names and one-line descriptions is the
      # same over-fetch the messenger had, and this list refetches on every convert, reassign and
      # reply. The open thread is fetched on its own below.
      #
      # (No backticks in this comment. It lives inside a JS template literal, where a backtick
      # ends the string - the same trap documented at the top of server/graphql/typeDefs.js.)
      conversation {
        id
      }
    }
  }
`;

const CREATE_MESSAGE = gql`
  mutation createMessage(
    $conversationId: ID!
    $senderId: ID!
    $message: String!
  ) {
    createMessage(
      conversationId: $conversationId
      senderId: $senderId
      message: $message
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
  // Distinct from "Declined" - the consult happened, the client just chose not to move forward
  // afterward. See BookingRequest.status's own comment (server/models/BookingRequest.js) for why
  // these are kept as two separate terminal values instead of one shared "closed" status.
  not_booked: "Not booked",
};

const ArtistBookingRequests = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [replyError, setReplyError] = useState(null);
  const [convertError, setConvertError] = useState(null);
  // Which outcome's date/time sub-form is currently open ('consult_booked' | 'session_booked' | null)
  const [pendingOutcome, setPendingOutcome] = useState(null);
  // Only used for the consult_booked form - a consult is always a single meeting, unlike Book
  // Session (see BookSessionDatesForm, which manages its own date list and looks/behaves like a
  // real date/time picker instead of a plain native input).
  const [consultDate, setConsultDate] = useState(moment());
  const [showReassignPicker, setShowReassignPicker] = useState(false);
  // The open request's messages, loaded on selection rather than arriving with the list.
  const [threadMessages, setThreadMessages] = useState([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const messageInput = useRef();

  const shopId = user.userInfo?.shop?.id;

  const { data, loading, error, refetch } = useQuery(GET_BOOKING_REQUESTS, {
    variables: { artistId: user.id, statuses: STATUS_FILTERS[statusFilter].statuses },
  });

  // Only meaningful when the caller has a shop - an independent artist has no shop-mates to
  // forward a request to. Reuses the same skip-guarded query the calendar's artist filter
  // already relies on (see ibCalendar/Sidebar.jsx).
  const { data: shopArtistsData } = ArtistService.fetchArtistsByShop(shopId);
  const otherShopArtists = (shopArtistsData?.getArtistsByShop || []).filter(
    (a) => String(a.user?.id) !== String(user.id)
  );

  // Which request is open, resolved before any early return, because the thread-loading effect
  // below is a hook and hooks cannot live after a conditional return.
  const requests = data?.getBookingRequests || [];
  const selected = requests.find((r) => r.id === selectedId) || requests[0];
  const selectedConversationId = selected?.conversation?.id || null;

  // The same query the messenger uses, rather than a second one shaped slightly differently.
  // Two definitions of "fetch this thread" is how the two message-notification paths ended up
  // with different email copy and different throttles.
  const [loadThread, { loading: loadingThread }] =
    MessengerService.fetchMessagesByConversationId();

  const refreshThread = useCallback(() => {
    if (!selectedConversationId) {
      setThreadMessages([]);
      return Promise.resolve();
    }
    return loadThread({ variables: { conversationId: selectedConversationId } })
      .then((res) => setThreadMessages(res?.data?.getMessagesByConversationId || []))
      .catch(() => setThreadMessages([]));
  }, [loadThread, selectedConversationId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedConversationId) {
      setThreadMessages([]);
      return undefined;
    }
    loadThread({ variables: { conversationId: selectedConversationId } })
      .then((res) => {
        // Clicking quickly through several requests can land responses out of order, and the last
        // to arrive is not necessarily the one on screen.
        if (!cancelled) {
          setThreadMessages(res?.data?.getMessagesByConversationId || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThreadMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, loadThread]);

  const [createMessage, { loading: sending }] = useMutation(CREATE_MESSAGE, {
    onCompleted() {
      messageInput.current.value = "";
      setReplyError(null);
      // Reloads the THREAD, not the whole request list. The list has nothing on it that a new
      // message changes, and refetching it was previously how the new message appeared at all -
      // which is precisely why every reply used to re-download every thread the artist had.
      refreshThread();
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

  const handleReply = (e) => {
    e.preventDefault();
    const message = messageInput.current.value.trim();
    if (!message || !selected) {
      return;
    }
    createMessage({
      variables: {
        conversationId: selected.conversation.id,
        senderId: user.id,
        message,
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

  // Only reachable from a consult_booked request (see the resolver's own transition guard) - the
  // consult happened, the client isn't moving forward. Distinct from Decline, which is for a
  // request that never got that far.
  const handleMarkNotBooked = () => {
    if (!selected) return;
    if (
      !window.confirm(
        "Mark this as not booked? This can't be undone, but you can still message the client."
      )
    ) {
      return;
    }
    convertBookingRequest({
      variables: { bookingRequestId: selected.id, outcome: "not_booked" },
    });
  };

  const handleConfirmConsult = (e) => {
    e.preventDefault();
    if (!selected) return;
    convertBookingRequest({
      variables: {
        bookingRequestId: selected.id,
        outcome: "consult_booked",
        // shopCutStatus/appointmentStatus are sensible defaults for a freshly-booked consult, not
        // something worth a form field for yet - both are editable afterward from the regular
        // Appointments views like any other appointment.
        appointmentInput: {
          appointmentDate: moment(consultDate).toISOString(),
          shopCutStatus: "unpaid",
          appointmentStatus: "scheduled",
        },
      },
    });
  };

  // BookSessionDatesForm (see that component's own comment) handles the session_booked outcome
  // itself - it calls convertBookingRequest for the first date and createAppointment for any
  // additional ones, so this just closes the form, refreshes the list, and follows the artist to
  // the new Project, the same way ConsultDetail.jsx's own "Convert to Session" does.
  const handleSessionBooked = (projectId) => {
    setPendingOutcome(null);
    refetch();
    if (projectId) {
      navigate(`${ROUTE_CONSTANTS.PROJECT}${projectId}`);
    }
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
        {/* Changing this changes the QUERY, not a client-side filter - closed requests are never
            fetched until they're asked for. */}
        <select
          className="bookingRequestsFilter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            // The selected request may not exist in the new list. Clearing lets the render fall
            // back to the first of whatever comes back, rather than showing a detail pane for a
            // request that is no longer listed beside it.
            setSelectedId(null);
          }}
        >
          {Object.entries(STATUS_FILTERS).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {requests.length === 0 && (
          <div className="bookingRequestsEmpty">
            {statusFilter === "open"
              ? "No open booking requests."
              : "Nothing here."}
          </div>
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
                    setConsultDate(moment());
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

            {/* The consult already happened - the only two places this can go next are booking
                the actual session (spawns a Project, same "Book Session" sub-form as above) or
                marking it not booked (the client decided not to move forward). Forwarding to a
                shop-mate doesn't apply here - that's for a request nobody's engaged with yet. */}
            {selected.status === "consult_booked" && (
              <div className="bookingRequestDetailActions">
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
                  onClick={handleMarkNotBooked}
                  disabled={converting}
                >
                  Mark Not Booked
                </button>
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

            {pendingOutcome === "consult_booked" && (
              <form className="bookingRequestConvertForm" onSubmit={handleConfirmConsult}>
                <IBDateTimePicker label="Consult date & time" val={consultDate} setVal={setConsultDate} />
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
            {pendingOutcome === "session_booked" && (
              <BookSessionDatesForm
                bookingRequestId={selected.id}
                onSuccess={handleSessionBooked}
                onCancel={() => setPendingOutcome(null)}
                // Deliberately no consultAppointmentId here. This is the inbox for a request that
                // is being booked straight to a session without a consult ever happening - there
                // is no consult transaction for a deposit to belong to, so the form doesn't offer
                // the field. A deposit taken at a later consult gets recorded there instead.
              />
            )}
            {convertError && <div className="bookingRequestError">{convertError}</div>}

            <div className="bookingRequestConversation">
              {loadingThread && threadMessages.length === 0 && (
                <div className="bookingRequestThreadLoading">Loading conversation...</div>
              )}
              {threadMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    String(msg.senderId) === String(user.id)
                      ? "guestMessage guestMessageMine"
                      : "guestMessage guestMessageTheirs"
                  }
                >
                  <div className="guestMessageBubble">{msg.message}</div>
                  {/* Same formatter as the messenger (utils/messageTime.js). This pane had no
                      timestamp at all, so a request could sit for a week with no indication of
                      whether the last word was yours or theirs, or when. */}
                  <div className="guestMessageTime" title={fullMessageTime(msg.createdAt)}>
                    {prettyMessageTime(msg.createdAt)}
                  </div>
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
