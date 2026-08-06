import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import { gql, useMutation, useQuery } from "@apollo/client";
import { prettyMessageTime, fullMessageTime } from "../../utils/messageTime";
import "./guestConversation.css";

const GET_BOOKING_REQUEST_BY_TOKEN = gql`
  query getBookingRequestByToken($token: String!) {
    getBookingRequestByToken(token: $token) {
      id
      status
      description
      placement
      size
      budget
      availability
      isCoverUp
      artistId
      client {
        userId
        firstName
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

const GET_PUBLIC_ARTIST_PROFILE = gql`
  query getPublicArtistProfile($artistId: ID!) {
    getPublicArtistProfile(artistId: $artistId) {
      firstName
      lastName
    }
  }
`;

const SEND_GUEST_MESSAGE = gql`
  mutation sendGuestMessage($token: String!, $message: String!) {
    sendGuestMessage(token: $token, message: $message) {
      id
      senderId
      message
      createdAt
    }
  }
`;

const STATUS_LABELS = {
  pending: "Pending",
  consult_booked: "Consult booked",
  session_booked: "Session booked",
  declined: "Declined",
  not_booked: "Not booked",
};

const GuestConversation = () => {
  const { token } = useParams();
  const messageInput = useRef();
  const [sendError, setSendError] = useState(null);

  // Polls rather than opening a socket connection - SocketProvider is keyed to an authenticated
  // user's id (see context/SocketProvider.js), and a guest has no account/session to key one to.
  // 15s is frequent enough that a reply doesn't feel stuck, without hammering the rate-limited
  // public endpoint (see utils/rate-limit.js - this is a query, not one of the limited
  // mutations, but there's no reason to poll faster than a human reads on this scale either).
  const { data, loading, error, refetch } = useQuery(GET_BOOKING_REQUEST_BY_TOKEN, {
    variables: { token },
    skip: !token,
    pollInterval: 15000,
    fetchPolicy: "cache-and-network",
  });

  const bookingRequest = data?.getBookingRequestByToken;

  const { data: artistData } = useQuery(GET_PUBLIC_ARTIST_PROFILE, {
    variables: { artistId: bookingRequest?.artistId },
    skip: !bookingRequest?.artistId,
  });

  const [sendGuestMessage, { loading: sending }] = useMutation(SEND_GUEST_MESSAGE, {
    onCompleted() {
      messageInput.current.value = "";
      setSendError(null);
      refetch();
    },
    onError(err) {
      setSendError(err.graphQLErrors?.[0]?.message || err.message);
    },
  });

  const handleSend = (e) => {
    e.preventDefault();
    const message = messageInput.current.value.trim();
    if (!message) {
      return;
    }
    sendGuestMessage({ variables: { token, message } });
  };

  if (!token) {
    return (
      <div className="guestConversation">
        <div className="guestConversationWrapper">
          <p>This link is missing a token. Double-check the link and try again.</p>
        </div>
      </div>
    );
  }

  if (loading && !bookingRequest) {
    return (
      <div className="guestConversation">
        <div className="guestConversationWrapper">
          <CircularProgress color="inherit" size="30px" />
        </div>
      </div>
    );
  }

  if (error || !bookingRequest) {
    // resolveGuestToken (utils/guest-auth.js) throws for an unknown token, or once the
    // underlying User has set a real password - the link is a deliberate password-auth bypass,
    // so it must stop working the moment there's a password to bypass.
    return (
      <div className="guestConversation">
        <div className="guestConversationWrapper">
          <p>
            This link is no longer active. If you already have an InkBooks account, please log in
            instead.
          </p>
        </div>
      </div>
    );
  }

  const artistName = artistData?.getPublicArtistProfile
    ? `${artistData.getPublicArtistProfile.firstName} ${artistData.getPublicArtistProfile.lastName}`
    : "your artist";
  const myUserId = bookingRequest.client?.userId;
  const messages = bookingRequest.conversation?.messages || [];

  return (
    <div className="guestConversation">
      <div className="guestConversationWrapper">
        <div className="guestConversationHeader">
          <h3 className="guestConversationLogo">Your request to {artistName}</h3>
          <span className="guestConversationStatus">
            {STATUS_LABELS[bookingRequest.status] || bookingRequest.status}
          </span>
        </div>

        <div className="guestConversationSummary">
          <p>{bookingRequest.description}</p>
          {bookingRequest.placement && <span>Placement: {bookingRequest.placement}</span>}
          {bookingRequest.size && <span>Size: {bookingRequest.size}</span>}
          {bookingRequest.budget && <span>Budget: {bookingRequest.budget}</span>}
          {bookingRequest.isCoverUp && <span>Cover-up / touch-up</span>}
        </div>

        <div className="guestConversationMessages">
          {messages.length === 0 && (
            <div className="guestConversationEmpty">No messages yet.</div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={
                String(msg.senderId) === String(myUserId)
                  ? "guestMessage guestMessageMine"
                  : "guestMessage guestMessageTheirs"
              }
            >
              <div className="guestMessageBubble">{msg.message}</div>
              <div className="guestMessageTime" title={fullMessageTime(msg.createdAt)}>
                {prettyMessageTime(msg.createdAt)}
              </div>
            </div>
          ))}
        </div>

        <form className="guestConversationInputRow" onSubmit={handleSend}>
          <input
            placeholder="Write a message..."
            ref={messageInput}
            className="guestConversationInput"
          />
          <button className="guestConversationSendButton" type="submit" disabled={sending}>
            {sending ? <CircularProgress color="inherit" size="18px" /> : "Send"}
          </button>
        </form>
        {sendError && <div className="guestConversationError">{sendError}</div>}
      </div>
    </div>
  );
};

export default GuestConversation;
