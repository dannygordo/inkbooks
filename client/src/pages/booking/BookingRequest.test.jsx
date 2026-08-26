// BookingRequest.jsx tests - the PUBLIC, unauthenticated booking intake form at /book/:artistHandle
// (or /book/<raw artist id> for links handed out before slugs existed - see the component's own
// header comment on DEFAULT_BOOKING_FIELDS). No AuthContext anywhere below: the component imports
// nothing from context/auth, resolves the artist purely through the public
// getPublicArtistProfile query, and its optional-field layout through FormService's public
// GET_PUBLIC_FORM_BY_SLUG - the same public-page shape PublicFormBySlugFillOut.test.jsx follows for
// its own sibling public page.
//
// GET_PUBLIC_ARTIST_PROFILE is declared INLINE in BookingRequest.jsx (not exported by any
// service), so it is reconstructed verbatim below. CREATE_BOOKING_REQUEST is also declared inline,
// but its shape is byte-for-byte identical to BookingRequestService's own exported
// CREATE_BOOKING_REQUEST_MUTATION (same operation name, same variable, same selection set) -
// MockedProvider matches a mock to a call by the query's PARSED shape and variables, not object
// identity, so mocking against the real shared document is exactly as valid as reconstructing a
// local copy, and additionally proves this page's local copy hasn't drifted from the shared one.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import { GraphQLError } from "graphql";
import BookingRequest from "./BookingRequest";
import BookingRequestService from "../../services/BookingRequestService";
import FormService from "../../services/FormService";

// ---- reconstructed inline document (see header comment) -----------------------------------------

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

// ---- fixtures -------------------------------------------------------------------------------

const HANDLE = "maya-chen";
const ARTIST_ID = "artist-99";

function artistProfileMock(overrides = {}) {
  return {
    request: {
      query: GET_PUBLIC_ARTIST_PROFILE,
      variables: { artistHandle: HANDLE },
    },
    result: {
      data: {
        getPublicArtistProfile: {
          __typename: "PublicArtistProfile",
          id: ARTIST_ID,
          firstName: "Maya",
          lastName: "Chen",
          avatar: null,
          bookingSlug: HANDLE,
          archived: false,
          ...overrides,
        },
      },
    },
  };
}

function formFieldsMock({ state = "missing", form = null } = {}) {
  return {
    request: {
      query: FormService.GET_PUBLIC_FORM_BY_SLUG,
      variables: { formSlug: "book", ownerHandle: HANDLE },
    },
    result: {
      data: { getPublicFormBySlug: { __typename: "PublicFormLookup", state, form } },
    },
  };
}

// The full DEFAULT_BOOKING_FIELDS set of optional answers, all left blank/false - what
// createBookingRequest receives when the guest fills in only the required core fields.
const BLANK_OPTIONAL_ANSWERS = {
  placement: null,
  size: null,
  budget: null,
  availability: null,
  isCoverUp: false,
  howHeard: null,
};

function renderPage({ mocks = [], path = `/book/${HANDLE}`, routePath = "/book/:artistHandle" } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MockedProvider mocks={mocks}>
        <Routes>
          <Route path={routePath} element={<BookingRequest />} />
        </Routes>
      </MockedProvider>
    </MemoryRouter>,
  );
}

// ---- missing / invalid / archived artist -----------------------------------------------------

describe("no artist in the URL", () => {
  it("shows a plain message rather than querying for an artist at all", () => {
    // A route with no :artistHandle segment at all - useParams().artistHandle is undefined, the
    // same as a malformed link. No mocks supplied: if the component queried anyway with a null
    // artistHandle, Apollo would surface "no matching mock" instead of this message.
    renderPage({ mocks: [], path: "/book", routePath: "/book" });

    expect(
      screen.getByText("This booking link is missing an artist. Double-check the link and try again."),
    ).toBeInTheDocument();
  });
});

describe("resolving the artist", () => {
  it("shows a spinner while the artist profile loads", () => {
    renderPage({ mocks: [artistProfileMock(), formFieldsMock()] });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows a not-found message for an unknown handle", async () => {
    const notFoundMock = {
      request: { query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistHandle: HANDLE } },
      result: { data: { getPublicArtistProfile: null } },
    };
    renderPage({ mocks: [notFoundMock, formFieldsMock()] });

    expect(
      await screen.findByText("We couldn't find this artist. Double-check the link and try again."),
    ).toBeInTheDocument();
  });

  it("shows a not-found message when the profile query itself errors", async () => {
    const errorMock = {
      request: { query: GET_PUBLIC_ARTIST_PROFILE, variables: { artistHandle: HANDLE } },
      error: new Error("Network error"),
    };
    renderPage({ mocks: [errorMock, formFieldsMock()] });

    expect(
      await screen.findByText("We couldn't find this artist. Double-check the link and try again."),
    ).toBeInTheDocument();
  });

  it("shows a distinct message for an archived artist", async () => {
    renderPage({ mocks: [artistProfileMock({ archived: true }), formFieldsMock()] });

    expect(await screen.findByText("This artist is no longer on the platform.")).toBeInTheDocument();
    expect(screen.queryByText(/Book with/)).not.toBeInTheDocument();
  });
});

// ---- rendering the intake form ----------------------------------------------------------------

describe("the intake form", () => {
  it("renders the artist's name and the default optional fields when no custom form config exists", async () => {
    renderPage({ mocks: [artistProfileMock(), formFieldsMock({ state: "missing", form: null })] });

    expect(await screen.findByText("Book with Maya Chen")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tell Maya about the piece you have in mind. No account needed - you'll get an email with a link to view and continue this conversation.",
      ),
    ).toBeInTheDocument();

    // The always-present guest-identity fields.
    expect(screen.getByPlaceholderText("First Name")).toBeRequired();
    expect(screen.getByPlaceholderText("Last Name")).toBeRequired();
    expect(screen.getByPlaceholderText("Email")).toBeRequired();
    expect(screen.getByPlaceholderText("Phone (optional)")).not.toBeRequired();
    expect(screen.getByPlaceholderText("Describe what you have in mind")).toBeRequired();

    // DEFAULT_BOOKING_FIELDS - all optional, all shown, in order.
    expect(screen.getByPlaceholderText("Placement (e.g. forearm)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Size (e.g. 4in x 6in)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Budget range")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Availability")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("How did you hear about us?")).toBeInTheDocument();
    expect(screen.getByLabelText("This is a cover-up or touch-up")).toBeInTheDocument();
    expect(screen.getByText("Reference images (optional, up to 5)")).toBeInTheDocument();
  });

  it("uses the shop's own booking_request form config when it publishes one", async () => {
    const customForm = {
      __typename: "PublicForm",
      id: "form-1",
      title: "Booking",
      description: null,
      fields: [
        { __typename: "FormField", key: "placement", type: "short_text", label: "Where on your body?", helpText: null, required: true, options: [], hidden: false },
        // hidden - must be omitted from the rendered form entirely, not just from being required.
        { __typename: "FormField", key: "budget", type: "short_text", label: "Budget", helpText: null, required: false, options: [], hidden: true },
        { __typename: "FormField", key: "referenceImages", type: "file", label: "Show us examples", helpText: null, required: false, options: [], hidden: false },
      ],
    };
    renderPage({ mocks: [artistProfileMock(), formFieldsMock({ state: "ok", form: customForm })] });

    await screen.findByText("Book with Maya Chen");

    expect(screen.getByPlaceholderText("Where on your body?")).toBeRequired();
    expect(screen.getByText("Show us examples")).toBeInTheDocument();
    // Hidden per the shop's config - and the defaults (which would have shown "Budget range")
    // don't leak through either.
    expect(screen.queryByPlaceholderText("Budget")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Budget range")).not.toBeInTheDocument();
    // Only what the custom config lists - the other four DEFAULT_BOOKING_FIELDS entries are gone.
    expect(screen.queryByPlaceholderText("Size (e.g. 4in x 6in)")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Availability")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("How did you hear about us?")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("This is a cover-up or touch-up")).not.toBeInTheDocument();
  });

  it("falls back to the defaults when the form lookup resolves to a non-ok state", async () => {
    renderPage({ mocks: [artistProfileMock(), formFieldsMock({ state: "not_found", form: null })] });

    await screen.findByText("Book with Maya Chen");
    expect(screen.getByPlaceholderText("Placement (e.g. forearm)")).toBeInTheDocument();
  });
});

// ---- submitting -----------------------------------------------------------------------------

describe("submitting", () => {
  it("sends the RESOLVED artist id (not the URL handle) with the filled-in fields and shows the confirmation", async () => {
    const user = userEvent.setup();
    const submitMock = {
      request: {
        query: BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION,
        variables: {
          bookingRequestInput: {
            artistId: ARTIST_ID,
            firstName: "Arya",
            lastName: "Stark",
            email: "arya@example.com",
            phone: null,
            description: "Direwolf, full back piece.",
            referenceImages: [],
            ...BLANK_OPTIONAL_ANSWERS,
          },
        },
      },
      result: {
        data: {
          createBookingRequest: { __typename: "BookingRequest", id: "req-1", status: "pending" },
        },
      },
    };
    renderPage({ mocks: [artistProfileMock(), formFieldsMock(), submitMock] });

    await screen.findByText("Book with Maya Chen");
    await user.type(screen.getByPlaceholderText("First Name"), "Arya");
    await user.type(screen.getByPlaceholderText("Last Name"), "Stark");
    await user.type(screen.getByPlaceholderText("Email"), "arya@example.com");
    // Phone left blank on purpose - the component sends `phone.current.value || null`.
    await user.type(
      screen.getByPlaceholderText("Describe what you have in mind"),
      "Direwolf, full back piece.",
    );
    await user.click(screen.getByRole("button", { name: "Send Request" }));

    // Reaching the success screen (rather than an Apollo "no matching mock" error) is the proof
    // artistId above resolved to ARTIST_ID and not to the "maya-chen" URL handle.
    expect(await screen.findByText("Request sent")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Thanks, Arya - your request has been sent to Maya. Check your email for a link to view and continue this conversation - no account needed.",
      ),
    ).toBeInTheDocument();
  });

  it("fills in the optional answers and toggles the cover-up checkbox", async () => {
    const user = userEvent.setup();
    const submitMock = {
      request: {
        query: BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION,
        variables: {
          bookingRequestInput: {
            artistId: ARTIST_ID,
            firstName: "Gendry",
            lastName: "Baratheon",
            email: "gendry@example.com",
            phone: "555-0100",
            description: "Half sleeve, koi and waves.",
            referenceImages: [],
            placement: "Forearm",
            size: null,
            budget: null,
            availability: null,
            isCoverUp: true,
            howHeard: null,
          },
        },
      },
      result: {
        data: {
          createBookingRequest: { __typename: "BookingRequest", id: "req-2", status: "pending" },
        },
      },
    };
    renderPage({ mocks: [artistProfileMock(), formFieldsMock(), submitMock] });

    await screen.findByText("Book with Maya Chen");
    await user.type(screen.getByPlaceholderText("First Name"), "Gendry");
    await user.type(screen.getByPlaceholderText("Last Name"), "Baratheon");
    await user.type(screen.getByPlaceholderText("Email"), "gendry@example.com");
    await user.type(screen.getByPlaceholderText("Phone (optional)"), "555-0100");
    await user.type(
      screen.getByPlaceholderText("Describe what you have in mind"),
      "Half sleeve, koi and waves.",
    );
    await user.type(screen.getByPlaceholderText("Placement (e.g. forearm)"), "Forearm");
    await user.click(screen.getByLabelText("This is a cover-up or touch-up"));
    await user.click(screen.getByRole("button", { name: "Send Request" }));

    expect(await screen.findByText("Request sent")).toBeInTheDocument();
  });

  it("shows field-level errors from the server without leaving the success state", async () => {
    const user = userEvent.setup();
    // jsdom actually enforces native constraint validation on submit (HTMLFormElement's own
    // reportValidity() gate, unless the <form> has novalidate) - a real browser would refuse to
    // even fire the submit event for a required type="email" input holding "not-an-email", the
    // same as jsdom does here. That's exactly why this test exists (SERVER-side email validation,
    // as a defense the client's own HTML5 validation doesn't cover for e.g. a non-browser caller),
    // so it has to dispatch the submit event directly - fireEvent.submit bypasses the browser's
    // click-to-submit algorithm (and therefore its validation gate) that user.click's button click
    // would otherwise go through.
    const failingMock = {
      request: {
        query: BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION,
        variables: {
          bookingRequestInput: {
            artistId: ARTIST_ID,
            firstName: "Arya",
            lastName: "Stark",
            email: "not-an-email",
            phone: null,
            description: "Direwolf.",
            referenceImages: [],
            ...BLANK_OPTIONAL_ANSWERS,
          },
        },
      },
      result: {
        errors: [
          new GraphQLError("Validation failed.", {
            extensions: { errors: { email: "That doesn't look like a valid email address." } },
          }),
        ],
      },
    };
    const { container } = renderPage({ mocks: [artistProfileMock(), formFieldsMock(), failingMock] });

    await screen.findByText("Book with Maya Chen");
    await user.type(screen.getByPlaceholderText("First Name"), "Arya");
    await user.type(screen.getByPlaceholderText("Last Name"), "Stark");
    await user.type(screen.getByPlaceholderText("Email"), "not-an-email");
    await user.type(screen.getByPlaceholderText("Describe what you have in mind"), "Direwolf.");
    fireEvent.submit(container.querySelector("form"));

    expect(
      await screen.findByText("That doesn't look like a valid email address."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Request sent")).not.toBeInTheDocument();
  });

  it("shows the bare message for an error with no field-keyed extensions (e.g. rate limiting)", async () => {
    const user = userEvent.setup();
    const failingMock = {
      request: {
        query: BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION,
        variables: {
          bookingRequestInput: {
            artistId: ARTIST_ID,
            firstName: "Arya",
            lastName: "Stark",
            email: "arya@example.com",
            phone: null,
            description: "Direwolf.",
            referenceImages: [],
            ...BLANK_OPTIONAL_ANSWERS,
          },
        },
      },
      result: {
        errors: [
          new GraphQLError("Too many requests. Try again shortly.", {
            extensions: { code: "RATE_LIMITED" },
          }),
        ],
      },
    };
    renderPage({ mocks: [artistProfileMock(), formFieldsMock(), failingMock] });

    await screen.findByText("Book with Maya Chen");
    await user.type(screen.getByPlaceholderText("First Name"), "Arya");
    await user.type(screen.getByPlaceholderText("Last Name"), "Stark");
    await user.type(screen.getByPlaceholderText("Email"), "arya@example.com");
    await user.type(screen.getByPlaceholderText("Describe what you have in mind"), "Direwolf.");
    await user.click(screen.getByRole("button", { name: "Send Request" }));

    expect(await screen.findByText("Too many requests. Try again shortly.")).toBeInTheDocument();
  });
});

// ---- reference image uploads ------------------------------------------------------------------

describe("reference image uploads", () => {
  it("uploads selected files before submitting, and includes the returned URLs", async () => {
    const user = userEvent.setup();
    const file = new File(["ink"], "sleeve-ref.png", { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ urls: ["https://cdn.example.com/uploaded-1.png"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const submitMock = {
      request: {
        query: BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION,
        variables: {
          bookingRequestInput: {
            artistId: ARTIST_ID,
            firstName: "Arya",
            lastName: "Stark",
            email: "arya@example.com",
            phone: null,
            description: "Direwolf.",
            referenceImages: ["https://cdn.example.com/uploaded-1.png"],
            ...BLANK_OPTIONAL_ANSWERS,
          },
        },
      },
      result: {
        data: {
          createBookingRequest: { __typename: "BookingRequest", id: "req-3", status: "pending" },
        },
      },
    };

    try {
      renderPage({ mocks: [artistProfileMock(), formFieldsMock(), submitMock] });

      await screen.findByText("Book with Maya Chen");
      await user.type(screen.getByPlaceholderText("First Name"), "Arya");
      await user.type(screen.getByPlaceholderText("Last Name"), "Stark");
      await user.type(screen.getByPlaceholderText("Email"), "arya@example.com");
      await user.type(screen.getByPlaceholderText("Describe what you have in mind"), "Direwolf.");

      // DEFAULT_BOOKING_FIELDS' file input has no accessible label of its own text content beyond
      // its own <label> element - queried by its file type instead.
      const fileInput = document.querySelector('input[type="file"]');
      await user.upload(fileInput, file);
      expect(screen.getByText("1 file(s) selected")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Send Request|Uploading images/ }));

      expect(await screen.findByText("Request sent")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("booking-uploads"),
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows the upload error and never calls createBookingRequest when the upload fails", async () => {
    const user = userEvent.setup();
    const file = new File(["ink"], "sleeve-ref.png", { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "That file is too large." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      // No CREATE_BOOKING_REQUEST_MUTATION mock at all - if handleSubmit reached the mutation
      // despite the failed upload, Apollo would surface "no matching mock" instead of this
      // upload-specific error, which is exactly what this asserts does NOT happen.
      renderPage({ mocks: [artistProfileMock(), formFieldsMock()] });

      await screen.findByText("Book with Maya Chen");
      await user.type(screen.getByPlaceholderText("First Name"), "Arya");
      await user.type(screen.getByPlaceholderText("Last Name"), "Stark");
      await user.type(screen.getByPlaceholderText("Email"), "arya@example.com");
      await user.type(screen.getByPlaceholderText("Describe what you have in mind"), "Direwolf.");

      const fileInput = document.querySelector('input[type="file"]');
      await user.upload(fileInput, file);
      await user.click(screen.getByRole("button", { name: /Send Request|Uploading images/ }));

      expect(await screen.findByText("That file is too large.")).toBeInTheDocument();
      expect(screen.queryByText("Request sent")).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
