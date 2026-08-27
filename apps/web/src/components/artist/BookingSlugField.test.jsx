// BookingSlugField.jsx tests. See the component's own header comment for why the availability
// check happens on every keystroke (debounced) rather than on submit, and why it is a COURTESY
// check only - the server's unique index on Artist.bookingSlug is the real guarantee. What's worth
// pinning down here, in isolation from either caller (BookingLinkPanel, FormsPanel, and eventually
// the registration form), is: the field is CONTROLLED off `value`/`setValue`; the debounce actually
// debounces rather than firing per keystroke; the loading/available/taken states render from
// ArtistService.useCheckBookingSlug's own `data`/`loading`; and the `currentSlug` "this is already
// mine" guard suppresses both the request and the status UI.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import BookingSlugField from "./BookingSlugField";
import { ArtistService } from "../../services/ArtistService";

// CHECK_BOOKING_SLUG is a named export on ArtistService itself (unlike fetchArtist, which builds
// its query inside the hook and never exports it) - see ArtistService.test.js's own
// "useCheckBookingSlug / CHECK_BOOKING_SLUG" block, which mocks it the same way.
function slugMock(slug, { available = true, reason = null, delay } = {}) {
	return {
		request: { query: ArtistService.CHECK_BOOKING_SLUG, variables: { slug } },
		result: {
			data: {
				checkBookingSlugAvailable: {
					__typename: "BookingSlugAvailability",
					slug,
					available,
					reason,
				},
			},
		},
		...(delay !== undefined ? { delay } : {}),
	};
}

// BookingSlugField itself is controlled (value/setValue are props, not local state) - real callers
// (BookingLinkPanel, FormsPanel) each own a bit of local state that plays this role. This harness
// is that same shape, kept minimal, so typing into the field exercises the actual controlled
// round-trip rather than a component that ignores its own `value` prop (the exact bug the
// component's header comment describes replacing defaultValue with).
function Harness({ initialValue = "", currentSlug = null, error, helperText, label }) {
	const [value, setValue] = useState(initialValue);
	return (
		<BookingSlugField
			value={value}
			setValue={setValue}
			currentSlug={currentSlug}
			error={error}
			helperText={helperText}
			label={label}
		/>
	);
}

function renderField({ mocks = [], ...props } = {}) {
	render(
		<MockedProvider mocks={mocks} addTypename={false}>
			<Harness {...props} />
		</MockedProvider>,
	);
}

describe("initial render", () => {
	it("shows the label and an empty preview placeholder when there's no value yet", async () => {
		renderField();

		expect(screen.getByLabelText(/Booking link/)).toHaveValue("");
		// bookingOrigin() + "/book/" + the "your-name" fallback, exactly as rendered when
		// `normalized` is empty - see the component's bookingSlugPreview markup.
		expect(screen.getByText("your-name")).toBeInTheDocument();
		expect(
			screen.getByText(`${window.location.origin}/book/`, { exact: false }),
		).toBeInTheDocument();
	});

	it("accepts a custom label", () => {
		renderField({ label: "Your link" });
		expect(screen.getByLabelText("Your link")).toBeInTheDocument();
	});

	it("does not query checkBookingSlugAvailable before the field has been touched", async () => {
		// Zero mocks: MockedProvider throws loudly on any unmatched request, so simply rendering
		// with a non-empty starting value and reaching this point without an error IS the
		// assertion that mounting alone never fires the check.
		renderField({ initialValue: "renee-tattoo", mocks: [] });
		await waitFor(() => {
			expect(screen.queryByText(/Checking/)).not.toBeInTheDocument();
		});
	});
});

describe("typing into the field", () => {
	it("reflects the raw typed value back into the controlled input and the preview", async () => {
		const user = userEvent.setup();
		renderField({ mocks: [slugMock("new-handle")] });

		const field = screen.getByLabelText(/Booking link/);
		await user.type(field, "New-Handle");

		expect(field).toHaveValue("New-Handle");
		// The preview normalises (trim + lowercase) even though the input itself keeps the raw
		// keystrokes - see `normalized` vs the value passed to IBInput.
		expect(screen.getByText("new-handle")).toBeInTheDocument();
	});

	it("does not fire the availability query until the debounce elapses", async () => {
		const user = userEvent.setup();
		renderField({ mocks: [slugMock("new-handle")] });

		const field = screen.getByLabelText(/Booking link/);
		await user.type(field, "new-handle");

		// Immediately after typing, still inside the 350ms debounce window: nothing to show yet.
		// (Not asserting on the raw query itself since MockedProvider mocks are consumed
		// asynchronously regardless; the observable proxy for "hasn't fired" is that neither the
		// loading nor the resolved state has appeared.)
		expect(screen.queryByText(/Checking/)).not.toBeInTheDocument();
		expect(screen.queryByText("Available")).not.toBeInTheDocument();

		expect(await screen.findByText("Available")).toBeInTheDocument();
	});

	it("shows a loading indicator while the check is in flight, then Available", async () => {
		const user = userEvent.setup();
		// A short real delay so the "Checking…" state is observable before the mock resolves.
		renderField({ mocks: [slugMock("new-handle", { delay: 30 })] });

		const field = screen.getByLabelText(/Booking link/);
		await user.type(field, "new-handle");

		expect(await screen.findByText(/Checking/)).toBeInTheDocument();
		expect(await screen.findByText("Available")).toBeInTheDocument();
		expect(screen.queryByText(/Checking/)).not.toBeInTheDocument();
	});

	it("shows the server's reason and marks the field invalid when the slug is taken", async () => {
		const user = userEvent.setup();
		renderField({
			mocks: [slugMock("taken-handle", { available: false, reason: "That link is taken." })],
		});

		const field = screen.getByLabelText(/Booking link/);
		await user.type(field, "taken-handle");

		expect(await screen.findByText("That link is taken.")).toBeInTheDocument();
		// error is computed from `showStatus && result && !result.available` and forwarded to
		// IBInput's `error` prop, which MUI surfaces as aria-invalid on the underlying input.
		expect(field).toHaveAttribute("aria-invalid", "true");
	});

	it("only sends a single request for the final value after rapid retyping", async () => {
		const user = userEvent.setup();
		// Only the LAST slug the user lands on has a mock. If every keystroke fired its own
		// request instead of the debounce cancelling the earlier timers, MockedProvider would
		// throw on the first unmatched intermediate request (e.g. "n", "ne", "new", ...).
		renderField({ mocks: [slugMock("newhandle")] });

		const field = screen.getByLabelText(/Booking link/);
		await user.type(field, "newhandle");

		expect(await screen.findByText("Available")).toBeInTheDocument();
	});
});

describe("currentSlug (editing an existing artist)", () => {
	it("treats the field's own current slug as unchanged and never checks it", async () => {
		const user = userEvent.setup();
		// Zero mocks - if `unchanged` were computed wrong and the debounce fired anyway,
		// MockedProvider would throw on the unmatched CHECK_BOOKING_SLUG request.
		renderField({
			initialValue: "renee-tattoo",
			currentSlug: "renee-tattoo",
			mocks: [],
		});

		const field = screen.getByLabelText(/Booking link/);
		await user.click(field);
		await user.type(field, "{End} ");

		await waitFor(() => {
			expect(screen.queryByText(/Checking/)).not.toBeInTheDocument();
		});
		expect(screen.queryByText("Available")).not.toBeInTheDocument();
	});

	it("compares case-insensitively, so retyping the same handle in a different case is still unchanged", async () => {
		const user = userEvent.setup();
		renderField({
			initialValue: "renee-tattoo",
			currentSlug: "renee-tattoo",
			mocks: [],
		});

		const field = screen.getByLabelText(/Booking link/);
		await user.clear(field);
		await user.type(field, "RENEE-TATTOO");

		await waitFor(() => {
			expect(screen.queryByText(/Checking/)).not.toBeInTheDocument();
		});
		expect(screen.queryByText("Available")).not.toBeInTheDocument();
	});

	it("starts checking again once the value actually diverges from currentSlug", async () => {
		const user = userEvent.setup();
		renderField({
			initialValue: "renee-tattoo",
			currentSlug: "renee-tattoo",
			mocks: [slugMock("renee-ink")],
		});

		const field = screen.getByLabelText(/Booking link/);
		await user.clear(field);
		await user.type(field, "renee-ink");

		expect(await screen.findByText("Available")).toBeInTheDocument();
	});
});

describe("explicit error / helperText props", () => {
	it("shows a caller-supplied error message and marks the field invalid even with no typing yet", () => {
		renderField({ error: "Booking link is required.", mocks: [] });

		const field = screen.getByLabelText(/Booking link/);
		expect(field).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByText("Booking link is required.")).toBeInTheDocument();
	});

	it("falls back to the supplied helperText when there is no error and no status to show", () => {
		renderField({ helperText: "Pick something short and memorable.", mocks: [] });
		expect(screen.getByText("Pick something short and memorable.")).toBeInTheDocument();
	});
});
