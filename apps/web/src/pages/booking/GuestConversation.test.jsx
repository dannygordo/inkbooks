// GuestConversation.jsx tests. Public/guest-facing by design - see the component's own header
// comment: a booking-request token is a deliberate password-auth bypass, so this page reads a
// :token route param and never touches AuthContext at all (no login, no user, nothing to wrap in
// AuthContext.Provider - unlike Client.test.jsx or FormsPanel.test.jsx, both of which authenticate
// through it).
//
// GET_BOOKING_REQUEST_BY_TOKEN, GET_PUBLIC_ARTIST_PROFILE and SEND_GUEST_MESSAGE are all defined
// INSIDE GuestConversation.jsx itself and never exported (unlike MessengerService.js's documents,
// which are all separately exported - see MessengerService.test.js's own header comment on that
// contrast). Reconstructed verbatim below, field-for-field - same situation FormsPanel.test.jsx
// documents for ArtistService.fetchArtist: MockedProvider matches by the query's parsed shape and
// variables, not object identity, so a same-shape copy still targets the real operation, and still
// fails loudly (an unmatched-mock error, not a silent pass) if GuestConversation.jsx's own
// selection set ever drifts from what's copied here.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import GuestConversation from "./GuestConversation";

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

function bookingRequest(overrides = {}) {
	return {
		__typename: "BookingRequest",
		id: "br-1",
		status: "pending",
		description: "Small floral piece on forearm",
		placement: "Forearm",
		size: "3 inches",
		budget: "$200",
		availability: "Weekends",
		isCoverUp: false,
		artistId: "artist-1",
		client: { __typename: "Client", userId: "guest-user-1", firstName: "Jon" },
		conversation: { __typename: "Conversation", id: "convo-1", messages: [] },
		...overrides,
	};
}

function tokenMock(token, data) {
	return {
		request: { query: GET_BOOKING_REQUEST_BY_TOKEN, variables: { token } },
		result: { data: { getBookingRequestByToken: data } },
	};
}

function artistProfileMock(artistId, profile) {
	return {
		request: { query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistId } },
		result: { data: { getPublicArtistProfile: profile } },
	};
}

function sendMessageMock(token, message, response) {
	return {
		request: { query: SEND_GUEST_MESSAGE, variables: { token, message } },
		result: { data: { sendGuestMessage: response } },
	};
}

function renderGuest({ token = "tok-123", mocks = [] } = {}) {
	return render(
		<MemoryRouter initialEntries={[`/booking/${token}`]}>
			<MockedProvider mocks={mocks}>
				<Routes>
					<Route path="/booking/:token" element={<GuestConversation />} />
				</Routes>
			</MockedProvider>
		</MemoryRouter>,
	);
}

// No :token segment in either the URL or the matched route, so useParams().token comes back
// undefined - the same situation an artist's booking link with a stripped-off token would produce.
function renderGuestWithoutToken({ mocks = [] } = {}) {
	return render(
		<MemoryRouter initialEntries={["/booking"]}>
			<MockedProvider mocks={mocks}>
				<Routes>
					<Route path="/booking" element={<GuestConversation />} />
				</Routes>
			</MockedProvider>
		</MemoryRouter>,
	);
}

describe("missing token", () => {
	it("shows a message instead of querying anything", () => {
		renderGuestWithoutToken();

		expect(
			screen.getByText("This link is missing a token. Double-check the link and try again."),
		).toBeInTheDocument();
	});
});

describe("loading", () => {
	it("shows a spinner before the booking request resolves", () => {
		renderGuest({ mocks: [tokenMock("tok-123", bookingRequest())] });

		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});
});

describe("invalid or expired token", () => {
	// resolveGuestToken (utils/guest-auth.js) resolves to null for an unknown token, or once the
	// underlying User has set a real password - see the component's own comment on why the guest
	// link must stop working the moment there's a password to bypass.
	it("shows an inactive-link message when the token resolves to nothing", async () => {
		renderGuest({ mocks: [tokenMock("tok-123", null)] });

		expect(
			await screen.findByText(
				"This link is no longer active. If you already have an InkBooks account, please log in instead.",
			),
		).toBeInTheDocument();
	});

	it("shows the same inactive-link message when the query itself errors", async () => {
		renderGuest({
			mocks: [
				{
					request: { query: GET_BOOKING_REQUEST_BY_TOKEN, variables: { token: "tok-123" } },
					error: new Error("Not found"),
				},
			],
		});

		expect(await screen.findByText(/This link is no longer active/)).toBeInTheDocument();
	});
});

describe("populated", () => {
	it("renders the request summary, status, artist name once resolved, and the empty thread state", async () => {
		renderGuest({
			mocks: [
				tokenMock("tok-123", bookingRequest()),
				artistProfileMock("artist-1", {
					__typename: "PublicArtistProfile",
					firstName: "Renee",
					lastName: "Wolf",
				}),
			],
		});

		expect(await screen.findByText("Your request to Renee Wolf")).toBeInTheDocument();
		expect(screen.getByText("Pending")).toBeInTheDocument();
		expect(screen.getByText("Small floral piece on forearm")).toBeInTheDocument();
		expect(screen.getByText("Placement: Forearm")).toBeInTheDocument();
		expect(screen.getByText("Size: 3 inches")).toBeInTheDocument();
		expect(screen.getByText("Budget: $200")).toBeInTheDocument();
		expect(screen.queryByText("Cover-up / touch-up")).not.toBeInTheDocument();
		expect(screen.getByText("No messages yet.")).toBeInTheDocument();
	});

	it("shows a generic artist label until the public profile query resolves", async () => {
		// No GET_PUBLIC_ARTIST_PROFILE mock at all - artistData stays undefined, matching a request
		// on an artist whose public profile lookup is still pending (or never fired, e.g. no
		// artistId yet).
		renderGuest({ mocks: [tokenMock("tok-123", bookingRequest())] });

		expect(await screen.findByText("Your request to your artist")).toBeInTheDocument();
	});

	it("labels a cover-up request and each booking-request status", async () => {
		renderGuest({
			mocks: [tokenMock("tok-123", bookingRequest({ isCoverUp: true, status: "consult_booked" }))],
		});

		expect(await screen.findByText("Cover-up / touch-up")).toBeInTheDocument();
		expect(screen.getByText("Consult booked")).toBeInTheDocument();
	});

	it("falls back to the raw status string for one STATUS_LABELS doesn't recognize", async () => {
		renderGuest({ mocks: [tokenMock("tok-123", bookingRequest({ status: "some_new_status" }))] });

		expect(await screen.findByText("some_new_status")).toBeInTheDocument();
	});

	it("renders each message, distinguishing the guest's own from the artist's", async () => {
		const br = bookingRequest({
			conversation: {
				__typename: "Conversation",
				id: "convo-1",
				messages: [
					{
						__typename: "Message",
						id: "msg-1",
						senderId: "guest-user-1",
						message: "When are you free?",
						createdAt: "2026-08-20T12:00:00.000Z",
					},
					{
						__typename: "Message",
						id: "msg-2",
						senderId: "artist-1",
						message: "How about Friday?",
						createdAt: "2026-08-20T13:00:00.000Z",
					},
				],
			},
		});
		renderGuest({ mocks: [tokenMock("tok-123", br)] });

		// myUserId comes from bookingRequest.client.userId ("guest-user-1"), not from any signed-in
		// identity - there isn't one on this page.
		const mine = await screen.findByText("When are you free?");
		expect(mine.closest(".guestMessage")).toHaveClass("guestMessageMine");
		const theirs = screen.getByText("How about Friday?");
		expect(theirs.closest(".guestMessage")).toHaveClass("guestMessageTheirs");
	});
});

describe("sending a guest message", () => {
	it("sends the typed text against the token, clears the input, and shows the refetched thread", async () => {
		const user = userEvent.setup();
		const refetched = bookingRequest({
			conversation: {
				__typename: "Conversation",
				id: "convo-1",
				messages: [
					{
						__typename: "Message",
						id: "msg-1",
						senderId: "guest-user-1",
						message: "When are you free?",
						createdAt: "2026-08-20T12:00:00.000Z",
					},
				],
			},
		});
		renderGuest({
			mocks: [
				tokenMock("tok-123", bookingRequest()),
				sendMessageMock("tok-123", "When are you free?", {
					__typename: "Message",
					id: "msg-1",
					senderId: "guest-user-1",
					message: "When are you free?",
					createdAt: "2026-08-20T12:00:00.000Z",
				}),
				// onCompleted() calls refetch() - the same query fires again with the same token.
				tokenMock("tok-123", refetched),
			],
		});

		const input = await screen.findByPlaceholderText("Write a message...");
		await user.type(input, "When are you free?");
		await user.click(screen.getByRole("button", { name: "Send" }));

		expect(await screen.findByText("When are you free?")).toBeInTheDocument();
		await waitFor(() => expect(input).toHaveValue(""));
	});

	it("does not submit an empty or whitespace-only message", async () => {
		const user = userEvent.setup();
		// No SEND_GUEST_MESSAGE mock registered at all - if handleSend fired the mutation anyway on
		// whitespace, MockedProvider would surface an unmatched-request error.
		renderGuest({ mocks: [tokenMock("tok-123", bookingRequest())] });

		const input = await screen.findByPlaceholderText("Write a message...");
		await user.type(input, "   ");
		await user.click(screen.getByRole("button", { name: "Send" }));

		expect(screen.getByText("No messages yet.")).toBeInTheDocument();
	});

	it("shows the server's error message when sending fails, and leaves the typed text in place", async () => {
		const user = userEvent.setup();
		renderGuest({
			mocks: [
				tokenMock("tok-123", bookingRequest()),
				{
					request: { query: SEND_GUEST_MESSAGE, variables: { token: "tok-123", message: "Hello?" } },
					result: {
						errors: [{ message: "This conversation is no longer accepting messages." }],
					},
				},
			],
		});

		const input = await screen.findByPlaceholderText("Write a message...");
		await user.type(input, "Hello?");
		await user.click(screen.getByRole("button", { name: "Send" }));

		expect(
			await screen.findByText("This conversation is no longer accepting messages."),
		).toBeInTheDocument();
		// onError only sets sendError - it never clears the ref's value the way onCompleted does.
		expect(input).toHaveValue("Hello?");
	});

	it("disables the Send button while the mutation is in flight", async () => {
		const user = userEvent.setup();
		renderGuest({
			mocks: [
				tokenMock("tok-123", bookingRequest()),
				{
					// Delayed so the mutation is still pending when the assertion below runs -
					// without it, MockedProvider could resolve before this test observes `sending`.
					...sendMessageMock("tok-123", "One sec", {
						__typename: "Message",
						id: "msg-1",
						senderId: "guest-user-1",
						message: "One sec",
						createdAt: "2026-08-20T12:00:00.000Z",
					}),
					delay: 50,
				},
			],
		});

		const input = await screen.findByPlaceholderText("Write a message...");
		await user.type(input, "One sec");
		const sendButton = screen.getByRole("button", { name: "Send" });
		await user.click(sendButton);

		expect(sendButton).toBeDisabled();
	});
});
