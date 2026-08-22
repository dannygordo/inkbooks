// ArtistBookingRequests.jsx tests - the artist-facing booking-request inbox. This is a big page
// with several independent sub-flows glued to one selected request, so the suites below are
// organised the same way the component itself is:
//
//   - the list itself (loading/error/empty states, filter switching, pagination)
//   - the detail pane for whatever request is selected (auto-select, fields, reference images)
//   - its conversation thread (loading it, marking it read, replying)
//   - the four ways a PENDING or CONSULT_BOOKED request leaves that state: decline, mark not
//     booked, book a consult, book a session
//   - forwarding a request to a shop-mate
//
// GET_BOOKING_REQUESTS/CREATE_MESSAGE/CONVERT_BOOKING_REQUEST/REASSIGN_BOOKING_REQUEST are all
// declared INLINE in ArtistBookingRequests.jsx itself (not exported by any service), so they are
// reconstructed verbatim below, the same convention FormsPanel.test.jsx follows for
// ArtistService's non-exported FETCH_ARTIST_QUERY - if this file's copies ever drift from the
// component's own selection sets, the affected tests fail with Apollo's "no matching mock" error
// rather than silently passing on stale shapes. Everything else the page calls IS a real exported
// document (ArtistService.FETCH_ARTISTS_BY_SHOP, MessengerService's thread query and
// MARK_CONVERSATION_READ mutation) and is imported directly rather than copied.
//
// SCOPING NOTE: whichever request is selected renders its name, status label and description
// TWICE at once - once in its own list row, again in the detail pane above it (both use the exact
// same STATUS_LABELS text, and the same "firstName lastName"). A bare getByText/findByText for
// any of those three throws "multiple elements found" the moment the matching request is also
// the one selected - which is the normal case (there's usually only one item, and it auto-selects
// itself). Tests below that only need a generic "the query resolved" signal wait on the "Booking
// Requests" heading instead (rendered exactly once, never duplicated); tests that actually assert
// on the name/status/description scope the query to one pane with `within(...)`.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { gql } from "@apollo/client";
import moment from "moment";
import ArtistBookingRequests from "./ArtistBookingRequests";
import { AuthContext } from "../../context/auth";
import { ArtistService } from "../../services/ArtistService";
import MessengerService from "../../services/MessengerService";

// ---- reconstructed inline documents (see header comment) ---------------------------------------

const GET_BOOKING_REQUESTS = gql`
  query getBookingRequests($artistId: ID!, $statuses: [String!], $page: PageInput) {
    getBookingRequests(artistId: $artistId, statuses: $statuses, page: $page) {
      pageInfo { totalCount hasMore limit offset }
      items {
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
        unreadCount
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

const REASSIGN_BOOKING_REQUEST = gql`
  mutation reassignBookingRequest($bookingRequestId: ID!, $newArtistId: ID!) {
    reassignBookingRequest(bookingRequestId: $bookingRequestId, newArtistId: $newArtistId) {
      id
      artistId
      status
    }
  }
`;

// ---- fixtures ------------------------------------------------------------------------------

const ARTIST_ID = "artist-1";

// No shop by default - ArtistService.fetchArtistsByShop is skipped entirely without a shop id, so
// most tests below (which have nothing to do with forwarding) don't also have to supply a mock
// for a query they aren't exercising. The forwarding suite opts into a shop explicitly instead.
const DEFAULT_ARTIST = { id: ARTIST_ID, userInfo: {} };
const SHOP_ARTIST = { id: ARTIST_ID, userInfo: { shop: { id: "shop-1" } } };

function client(overrides = {}) {
  return {
    __typename: "Client",
    firstName: "Gendry",
    lastName: "Baratheon",
    email: "gendry@example.com",
    phone: "555-0100",
    ...overrides,
  };
}

function bookingRequest(overrides = {}) {
  return {
    __typename: "BookingRequest",
    id: "req-1",
    status: "pending",
    description: "Half sleeve, koi and waves.",
    placement: "Forearm",
    size: "6in x 10in",
    budget: "$800-1200",
    availability: "Weekday evenings",
    isCoverUp: false,
    howHeard: "Instagram",
    referenceImages: [],
    createdAt: "2026-08-01T12:00:00.000Z",
    client: client(),
    conversation: { __typename: "Conversation", id: "conv-1", unreadCount: 0 },
    ...overrides,
  };
}

function listMock({
  statuses,
  page = { limit: 25, offset: 0 },
  items = [bookingRequest()],
  artistId = ARTIST_ID,
  pageInfoOverrides = {},
} = {}) {
  return {
    request: {
      query: GET_BOOKING_REQUESTS,
      variables: { artistId, statuses, page },
    },
    result: {
      data: {
        getBookingRequests: {
          __typename: "BookingRequestPage",
          pageInfo: {
            __typename: "PageInfo",
            totalCount: items.length,
            hasMore: false,
            limit: page.limit,
            offset: page.offset,
            ...pageInfoOverrides,
          },
          items,
        },
      },
    },
  };
}

function threadMock(conversationId, messages) {
  return {
    request: {
      query: MessengerService.fetchMessagesByConversationIdQuery,
      variables: { conversationId },
    },
    result: {
      data: { getMessagesByConversationId: messages },
    },
  };
}

function markReadMock(conversationId, unreadCount = 0) {
  return {
    request: {
      query: MessengerService.MARK_CONVERSATION_READ,
      variables: { conversationId },
    },
    result: {
      data: {
        markConversationRead: { __typename: "Conversation", id: conversationId, unreadCount },
      },
    },
  };
}

function artistsByShopMock(shopId, artists) {
  return {
    request: {
      query: ArtistService.FETCH_ARTISTS_BY_SHOP,
      variables: { shopId },
    },
    result: { data: { getArtistsByShop: artists } },
  };
}

function renderPage({ user = DEFAULT_ARTIST, mocks = [] } = {}) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <AuthContext.Provider value={{ user }}>
          <ArtistBookingRequests />
        </AuthContext.Provider>
      </MockedProvider>
    </MemoryRouter>,
  );
}

// The empty conversation thread this page loads for every selected request (no messages yet),
// used by tests that don't care about the thread itself - still has to be supplied, since the
// selection effect fires unconditionally once a request with a conversation id is on screen.
function emptyThreadMocks(conversationId = "conv-1") {
  return [threadMock(conversationId, []), markReadMock(conversationId)];
}

// The list panel and the detail pane, scoped separately - see the file's own header comment on
// why a bare getByText for a name/status/description is unsafe once a request is selected.
function listPanel(container) {
  return within(container.querySelector(".bookingRequestsList"));
}
function detailPanel(container) {
  return within(container.querySelector(".bookingRequestDetail"));
}

// Waits for the page to leave its loading state. "Booking Requests" is the list panel's own
// heading, rendered exactly once regardless of which (if any) request is selected - a safe,
// generic "the query resolved" signal for tests that don't need to assert on list content itself.
async function waitForLoaded() {
  await screen.findByText("Booking Requests");
}

// ---- loading and error states -------------------------------------------------------------------

describe("loading and error states", () => {
  it("shows a spinner while the list is loading", () => {
    renderPage({ mocks: [listMock({ statuses: undefined })] });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows the server's error message when the list query fails", async () => {
    const errorMock = {
      request: {
        query: GET_BOOKING_REQUESTS,
        variables: { artistId: ARTIST_ID, statuses: undefined, page: { limit: 25, offset: 0 } },
      },
      error: new Error("Could not reach the server"),
    };
    renderPage({ mocks: [errorMock] });

    expect(
      await screen.findByText("Couldn't load booking requests: Could not reach the server"),
    ).toBeInTheDocument();
  });
});

// ---- empty states -----------------------------------------------------------------------------

describe("empty states", () => {
  it("tells a caught-up artist their pending queue is empty, and where booked requests went", async () => {
    renderPage({ mocks: [listMock({ statuses: undefined, items: [] })] });

    expect(await screen.findByText("Nothing waiting on you.")).toBeInTheDocument();
    expect(
      screen.getByText("Booked requests move to Messenger. Use the filter above to see them."),
    ).toBeInTheDocument();
  });

  it("shows a plain empty message for a non-pending filter", async () => {
    const user = userEvent.setup();
    renderPage({
      mocks: [
        listMock({ statuses: undefined }),
        ...emptyThreadMocks("conv-1"),
        listMock({ statuses: ["declined", "not_booked"], items: [] }),
      ],
    });

    await waitForLoaded();
    await user.selectOptions(screen.getByRole("combobox"), "closed");

    expect(await screen.findByText("Nothing here.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing waiting on you.")).not.toBeInTheDocument();
  });
});

// ---- list rendering -----------------------------------------------------------------------------

describe("list rendering", () => {
  it("renders each request's name, status label and description, with an unread dot when applicable", async () => {
    const { container } = renderPage({
      mocks: [
        listMock({
          statuses: undefined,
          items: [
            bookingRequest({
              id: "req-1",
              client: client({ firstName: "Gendry", lastName: "Baratheon" }),
              conversation: { __typename: "Conversation", id: "conv-1", unreadCount: 2 },
            }),
            bookingRequest({
              id: "req-2",
              status: "consult_booked",
              description: "Full back piece consult.",
              client: client({ firstName: "Arya", lastName: "Stark" }),
              conversation: { __typename: "Conversation", id: "conv-2", unreadCount: 0 },
            }),
          ],
        }),
        ...emptyThreadMocks("conv-1"),
      ],
    });
    await waitForLoaded();
    const list = listPanel(container);

    expect(list.getByText("Gendry Baratheon")).toBeInTheDocument();
    expect(list.getByText("Arya Stark")).toBeInTheDocument();
    expect(list.getByText("Half sleeve, koi and waves.")).toBeInTheDocument();
    expect(list.getByText("Full back piece consult.")).toBeInTheDocument();
    // req-1 (selected, first item) reads "Pending" in its own row; req-2 (not selected) reads
    // "Consult booked" and appears only once, so it's safe to check without scoping too.
    expect(list.getByText("Consult booked")).toBeInTheDocument();
    expect(list.getByTitle("2 unread")).toBeInTheDocument();
  });

  it("auto-selects the first request and shows its full detail when none has been clicked", async () => {
    renderPage({
      mocks: [
        listMock({
          statuses: undefined,
          items: [
            bookingRequest({
              referenceImages: ["https://cdn.example.com/ref-1.png"],
            }),
          ],
        }),
        ...emptyThreadMocks("conv-1"),
      ],
    });

    // These detail-only fields never appear in the list row, so no scoping is needed here.
    expect(await screen.findByText("Placement: Forearm")).toBeInTheDocument();
    expect(screen.getByText("Size: 6in x 10in")).toBeInTheDocument();
    expect(screen.getByText("Budget: $800-1200")).toBeInTheDocument();
    expect(screen.getByText("Availability: Weekday evenings")).toBeInTheDocument();
    expect(screen.getByText("Heard about us: Instagram")).toBeInTheDocument();
    expect(screen.getByText("gendry@example.com · 555-0100")).toBeInTheDocument();
    // The reference image is a link to the full-size original, wrapping a thumbnail.
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://cdn.example.com/ref-1.png");
  });

  it("does not show a cover-up/touch-up line when isCoverUp is false, but does when true", async () => {
    renderPage({
      mocks: [
        listMock({ statuses: undefined, items: [bookingRequest({ isCoverUp: true })] }),
        ...emptyThreadMocks("conv-1"),
      ],
    });

    expect(await screen.findByText("Cover-up / touch-up")).toBeInTheDocument();
  });
});

// ---- switching the status filter -----------------------------------------------------------------

describe("switching the status filter", () => {
  it("asks the server for a different set of statuses and resets the selection", async () => {
    const user = userEvent.setup();
    const { container } = renderPage({
      mocks: [
        listMock({ statuses: undefined, items: [bookingRequest({ id: "req-1" })] }),
        ...emptyThreadMocks("conv-1"),
        listMock({
          statuses: ["consult_booked", "session_booked"],
          items: [
            bookingRequest({
              id: "req-9",
              status: "session_booked",
              client: client({ firstName: "Sansa", lastName: "Stark" }),
              conversation: { __typename: "Conversation", id: "conv-9", unreadCount: 0 },
            }),
          ],
        }),
        ...emptyThreadMocks("conv-9"),
      ],
    });

    await waitForLoaded();
    await user.selectOptions(screen.getByRole("combobox"), "booked");

    // Changing statusFilter changes the query's variables, which briefly puts the page back into
    // its loading state (the whole two-pane UI - including ".bookingRequestsList" - unmounts for
    // that instant, see the component's own `if (loading) return <spinner>`), so this has to wait
    // for the heading to come back before it's safe to query inside the list panel again.
    await waitForLoaded();
    expect(listPanel(container).getByText("Sansa Stark")).toBeInTheDocument();
    expect(screen.queryByText("Gendry Baratheon")).not.toBeInTheDocument();
  });
});

// ---- the conversation thread ------------------------------------------------------------------

describe("the selected request's conversation thread", () => {
  it("loads the thread and marks it read once a request with a conversation is on screen", async () => {
    renderPage({
      mocks: [
        listMock({ statuses: undefined }),
        threadMock("conv-1", [
          {
            __typename: "Message",
            id: "msg-1",
            conversationId: "conv-1",
            senderId: "client-1",
            message: "Hi, is Tuesday still open?",
            imageUrls: [],
            createdAt: "2026-08-02T10:00:00.000Z",
            updatedAt: "2026-08-02T10:00:00.000Z",
            user: { __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null },
          },
        ]),
        markReadMock("conv-1"),
      ],
    });

    expect(await screen.findByText("Hi, is Tuesday still open?")).toBeInTheDocument();
  });

  it("styles the caller's own messages differently from the client's", async () => {
    renderPage({
      mocks: [
        listMock({ statuses: undefined }),
        threadMock("conv-1", [
          {
            __typename: "Message",
            id: "msg-1",
            conversationId: "conv-1",
            senderId: "client-1",
            message: "Hi, is Tuesday still open?",
            imageUrls: [],
            createdAt: "2026-08-02T10:00:00.000Z",
            updatedAt: "2026-08-02T10:00:00.000Z",
            user: null,
          },
          {
            __typename: "Message",
            id: "msg-2",
            conversationId: "conv-1",
            // Matches ARTIST_ID - this is the logged-in artist's own reply.
            senderId: ARTIST_ID,
            message: "Yes, 2pm works.",
            imageUrls: [],
            createdAt: "2026-08-02T10:05:00.000Z",
            updatedAt: "2026-08-02T10:05:00.000Z",
            user: null,
          },
        ]),
        markReadMock("conv-1"),
      ],
    });

    const theirs = await screen.findByText("Hi, is Tuesday still open?");
    const mine = screen.getByText("Yes, 2pm works.");
    // The text itself sits in "guestMessageBubble", a child of the "guestMessage(Mine|Theirs)"
    // container - .closest matches by class here rather than by tag, since the bubble div itself
    // also matches a bare "div" selector and would short-circuit .closest("div") one level early.
    expect(theirs.closest(".guestMessage")).toHaveClass("guestMessageTheirs");
    expect(mine.closest(".guestMessage")).toHaveClass("guestMessageMine");
  });
});

// ---- replying -----------------------------------------------------------------------------------

describe("replying", () => {
  it("sends a message, clears the input and refreshes the thread", async () => {
    const user = userEvent.setup();
    renderPage({
      mocks: [
        listMock({ statuses: undefined }),
        threadMock("conv-1", []),
        markReadMock("conv-1"),
        {
          request: {
            query: CREATE_MESSAGE,
            variables: { conversationId: "conv-1", senderId: ARTIST_ID, message: "See you Tuesday!" },
          },
          result: { data: { createMessage: { __typename: "Message", id: "msg-new" } } },
        },
        // refreshThread() re-fires the same lazy query after the reply completes.
        threadMock("conv-1", [
          {
            __typename: "Message",
            id: "msg-new",
            conversationId: "conv-1",
            senderId: ARTIST_ID,
            message: "See you Tuesday!",
            imageUrls: [],
            createdAt: "2026-08-02T11:00:00.000Z",
            updatedAt: "2026-08-02T11:00:00.000Z",
            user: null,
          },
        ]),
      ],
    });

    await waitForLoaded();
    const input = screen.getByPlaceholderText("Write a reply...");
    await user.type(input, "See you Tuesday!");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("See you Tuesday!")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("shows the server's error message when sending fails", async () => {
    const user = userEvent.setup();
    renderPage({
      mocks: [
        listMock({ statuses: undefined }),
        ...emptyThreadMocks("conv-1"),
        {
          request: {
            query: CREATE_MESSAGE,
            variables: { conversationId: "conv-1", senderId: ARTIST_ID, message: "Hello" },
          },
          error: new Error("Message could not be delivered."),
        },
      ],
    });

    await waitForLoaded();
    await user.type(screen.getByPlaceholderText("Write a reply..."), "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Message could not be delivered.")).toBeInTheDocument();
  });

  it("does nothing when the reply is blank", async () => {
    const user = userEvent.setup();
    renderPage({ mocks: [listMock({ statuses: undefined }), ...emptyThreadMocks("conv-1")] });

    await waitForLoaded();
    // No CREATE_MESSAGE mock supplied at all - if handleReply fired the mutation anyway, Apollo
    // would surface "no matching mock" as a GraphQL error, which is exactly what this asserts
    // does NOT happen.
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.queryByText(/could not be delivered/)).not.toBeInTheDocument();
  });
});

// ---- declining a request --------------------------------------------------------------------

describe("declining a request", () => {
  it("does nothing when the confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = renderPage({
      mocks: [listMock({ statuses: undefined }), ...emptyThreadMocks("conv-1")],
    });

    await waitForLoaded();
    // No CONVERT_BOOKING_REQUEST mock supplied - a call here would surface as an error.
    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(listPanel(container).getByText("Gendry Baratheon")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't/i)).not.toBeInTheDocument();
  });

  it("declines and refetches the list when confirmed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage({
      mocks: [
        listMock({ statuses: undefined }),
        ...emptyThreadMocks("conv-1"),
        {
          request: {
            query: CONVERT_BOOKING_REQUEST,
            variables: { bookingRequestId: "req-1", outcome: "declined" },
          },
          result: {
            data: {
              convertBookingRequest: {
                __typename: "BookingRequest",
                id: "req-1",
                status: "declined",
                resultingAppointmentId: null,
              },
            },
          },
        },
        // ArtistBookingRequests refetches the same list (same variables) after a successful
        // conversion - the declined request has left the default/open view.
        listMock({ statuses: undefined, items: [] }),
      ],
    });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(window.confirm).toHaveBeenCalledWith("Decline this booking request? This can't be undone.");
    expect(await screen.findByText("Nothing waiting on you.")).toBeInTheDocument();
  });

  it("shows the server's error message when declining fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage({
      mocks: [
        listMock({ statuses: undefined }),
        ...emptyThreadMocks("conv-1"),
        {
          request: {
            query: CONVERT_BOOKING_REQUEST,
            variables: { bookingRequestId: "req-1", outcome: "declined" },
          },
          error: new Error("That request can't be declined right now."),
        },
      ],
    });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(await screen.findByText("That request can't be declined right now.")).toBeInTheDocument();
  });
});

// ---- a consult_booked request: Mark Not Booked instead of Decline ------------------------------

describe("a consult_booked request", () => {
  it("offers Book Session and Mark Not Booked, not Decline/Book Consult/Forward", async () => {
    renderPage({
      mocks: [
        listMock({ statuses: undefined, items: [bookingRequest({ status: "consult_booked" })] }),
        ...emptyThreadMocks("conv-1"),
      ],
    });

    await waitForLoaded();
    expect(screen.getByRole("button", { name: "Book Session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Not Booked" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Book Consult" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forward to..." })).not.toBeInTheDocument();
  });

  it("marks the request not booked and refetches when confirmed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = renderPage({
      mocks: [
        listMock({ statuses: undefined, items: [bookingRequest({ status: "consult_booked" })] }),
        ...emptyThreadMocks("conv-1"),
        {
          request: {
            query: CONVERT_BOOKING_REQUEST,
            variables: { bookingRequestId: "req-1", outcome: "not_booked" },
          },
          result: {
            data: {
              convertBookingRequest: {
                __typename: "BookingRequest",
                id: "req-1",
                status: "not_booked",
                resultingAppointmentId: null,
              },
            },
          },
        },
        listMock({
          statuses: undefined,
          items: [bookingRequest({ status: "not_booked" })],
        }),
      ],
    });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Mark Not Booked" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Mark this as not booked? This can't be undone, but you can still message the client.",
    );
    expect(await detailPanel(container).findByText("Not booked")).toBeInTheDocument();
  });
});

// ---- booking a consult ----------------------------------------------------------------------

describe("booking a consult", () => {
  it("opens the date/time confirm form, and Cancel closes it again", async () => {
    const user = userEvent.setup();
    renderPage({ mocks: [listMock({ statuses: undefined }), ...emptyThreadMocks("conv-1")] });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Book Consult" }));

    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("confirms the consult with the current date/time and refetches the list", async () => {
    const user = userEvent.setup();
    // handleConfirmConsult sends moment(consultDate).toISOString(), and consultDate is set to
    // moment() the instant "Book Consult" is clicked - moment.now() is moment's own documented
    // hook for controlling what moment() with no argument resolves to, and overriding it (rather
    // than faking global timers) keeps every other async helper in this test running on real
    // timers, which MockedProvider and userEvent both depend on.
    const FIXED_NOW = Date.UTC(2026, 7, 22, 16, 30, 0);
    const originalMomentNow = moment.now;
    moment.now = () => FIXED_NOW;
    const expectedAppointmentDate = moment(FIXED_NOW).toISOString();

    try {
      const { container } = renderPage({
        mocks: [
          listMock({ statuses: undefined }),
          ...emptyThreadMocks("conv-1"),
          {
            request: {
              query: CONVERT_BOOKING_REQUEST,
              variables: {
                bookingRequestId: "req-1",
                outcome: "consult_booked",
                appointmentInput: {
                  appointmentDate: expectedAppointmentDate,
                  shopCutStatus: "unpaid",
                  appointmentStatus: "scheduled",
                },
              },
            },
            result: {
              data: {
                convertBookingRequest: {
                  __typename: "BookingRequest",
                  id: "req-1",
                  status: "consult_booked",
                  resultingAppointmentId: "appt-1",
                },
              },
            },
          },
          listMock({ statuses: undefined, items: [bookingRequest({ status: "consult_booked" })] }),
        ],
      });

      await waitForLoaded();
      await user.click(screen.getByRole("button", { name: "Book Consult" }));
      await user.click(await screen.findByRole("button", { name: "Confirm" }));

      // Reaching the updated status (rather than the mutation hanging on an unmatched mock, or
      // convertError rendering) is the proof the appointmentDate above matched byte-for-byte.
      expect(await detailPanel(container).findByText("Consult booked")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    } finally {
      moment.now = originalMomentNow;
    }
  });

  it("shows an error rather than hanging when the conversion request goes unanswered", async () => {
    const user = userEvent.setup();
    renderPage({ mocks: [listMock({ statuses: undefined }), ...emptyThreadMocks("conv-1")] });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Book Consult" }));
    // Deliberately no CONVERT_BOOKING_REQUEST mock at all - the exact appointmentDate sent can't
    // be predicted without controlling moment.now (see the previous test), so this instead pins
    // down that Apollo's "no matching mock" surfaces through the very same onError handler a real
    // server error would, landing in convertError rather than leaving the form hanging silently.
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(document.querySelector(".bookingRequestError")).toBeInTheDocument();
    });
  });
});

// ---- booking a session ----------------------------------------------------------------------

describe("booking a session", () => {
  // BookSessionDatesForm is a large, separately-owned component (see the comment on its own
  // file). This only checks that ArtistBookingRequests actually reaches it from both statuses
  // that offer "Book Session" - the sub-form's own submission logic is out of scope here.
  // DaySchedule (rendered inside it) fires its own getAppointmentsByArtist query; deliberately
  // left unmocked, the same way DaySchedule.jsx's own header comment says it degrades to
  // rendering nothing without one.
  it("opens BookSessionDatesForm from a pending request", async () => {
    const user = userEvent.setup();
    renderPage({ mocks: [listMock({ statuses: undefined }), ...emptyThreadMocks("conv-1")] });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Book Session" }));

    expect(await screen.findByText("Project title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add another session/i })).toBeInTheDocument();
  });

  it("opens BookSessionDatesForm from a consult_booked request too", async () => {
    const user = userEvent.setup();
    renderPage({
      mocks: [
        listMock({ statuses: undefined, items: [bookingRequest({ status: "consult_booked" })] }),
        ...emptyThreadMocks("conv-1"),
      ],
    });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Book Session" }));

    expect(await screen.findByText("Project title")).toBeInTheDocument();
  });
});

// ---- forwarding a request to a shop-mate -----------------------------------------------------

describe("forwarding a request to a shop-mate", () => {
  it("is hidden for an independent artist with no shop", async () => {
    // DEFAULT_ARTIST has no shop at all - fetchArtistsByShop is skip-guarded, so no mock for it
    // is supplied, and otherShopArtists is simply [].
    renderPage({ mocks: [listMock({ statuses: undefined }), ...emptyThreadMocks("conv-1")] });

    await waitForLoaded();
    expect(screen.queryByRole("button", { name: "Forward to..." })).not.toBeInTheDocument();
  });

  it("is hidden for a shop artist with no OTHER artists at the shop", async () => {
    renderPage({
      user: SHOP_ARTIST,
      mocks: [
        listMock({ statuses: undefined }),
        ...emptyThreadMocks("conv-1"),
        artistsByShopMock("shop-1", [
          { __typename: "Artist", id: "artist-record-1", user: { __typename: "User", id: ARTIST_ID, firstName: "Me", lastName: "Self", tagColor: null } },
        ]),
      ],
    });

    await waitForLoaded();
    expect(screen.queryByRole("button", { name: "Forward to..." })).not.toBeInTheDocument();
  });

  it("lists shop-mates and reassigns on confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage({
      user: SHOP_ARTIST,
      mocks: [
        listMock({ statuses: undefined }),
        ...emptyThreadMocks("conv-1"),
        artistsByShopMock("shop-1", [
          { __typename: "Artist", id: "artist-record-3", user: { __typename: "User", id: "artist-3", firstName: "Sansa", lastName: "Stark", tagColor: null } },
          { __typename: "Artist", id: "artist-record-1", user: { __typename: "User", id: ARTIST_ID, firstName: "Me", lastName: "Self", tagColor: null } },
        ]),
        {
          request: {
            query: REASSIGN_BOOKING_REQUEST,
            variables: { bookingRequestId: "req-1", newArtistId: "artist-3" },
          },
          result: {
            data: {
              reassignBookingRequest: {
                __typename: "BookingRequest",
                id: "req-1",
                artistId: "artist-3",
                status: "pending",
              },
            },
          },
        },
        // Forwarding removes it from THIS artist's own list on refetch.
        listMock({ statuses: undefined, items: [] }),
      ],
    });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Forward to..." }));

    // Only Sansa is offered - Me/Self is filtered out as the logged-in artist themselves.
    expect(screen.getByRole("option", { name: "Sansa Stark" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Me Self" })).not.toBeInTheDocument();

    // Two <select>s are on screen now - the status filter (always rendered) and the reassign
    // picker that just opened; the picker is the one added last.
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[selects.length - 1], "artist-3");

    expect(window.confirm).toHaveBeenCalledWith(
      "Forward this booking request to that artist? You won't see it here anymore.",
    );
    expect(await screen.findByText("Nothing waiting on you.")).toBeInTheDocument();
  });

  it("does nothing when the forward confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = renderPage({
      user: SHOP_ARTIST,
      mocks: [
        listMock({ statuses: undefined }),
        ...emptyThreadMocks("conv-1"),
        artistsByShopMock("shop-1", [
          { __typename: "Artist", id: "artist-record-3", user: { __typename: "User", id: "artist-3", firstName: "Sansa", lastName: "Stark", tagColor: null } },
        ]),
      ],
    });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Forward to..." }));
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[selects.length - 1], "artist-3");

    // No REASSIGN_BOOKING_REQUEST mock supplied - the request would surface as an error if the
    // mutation fired anyway despite the declined confirmation.
    expect(listPanel(container).getByText("Gendry Baratheon")).toBeInTheDocument();
  });
});

// ---- pagination -----------------------------------------------------------------------------

describe("pagination", () => {
  it("pages through the list and resets the selected request", async () => {
    const user = userEvent.setup();
    const { container } = renderPage({
      mocks: [
        listMock({
          statuses: undefined,
          items: [bookingRequest({ id: "req-1" })],
          pageInfoOverrides: { totalCount: 30, hasMore: true },
        }),
        ...emptyThreadMocks("conv-1"),
        listMock({
          statuses: undefined,
          page: { limit: 25, offset: 25 },
          items: [
            bookingRequest({
              id: "req-30",
              client: client({ firstName: "Sansa", lastName: "Stark" }),
              conversation: { __typename: "Conversation", id: "conv-30", unreadCount: 0 },
            }),
          ],
          pageInfoOverrides: { totalCount: 30, hasMore: false },
        }),
        ...emptyThreadMocks("conv-30"),
      ],
    });

    await waitForLoaded();
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Same transient full-page loading state as the filter-switch case above - wait for the
    // heading to reappear before querying inside the list panel again.
    await waitForLoaded();
    expect(listPanel(container).getByText("Sansa Stark")).toBeInTheDocument();
    expect(screen.queryByText("Gendry Baratheon")).not.toBeInTheDocument();
  });
});
