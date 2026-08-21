// ViewEventDialog.jsx tests. See that file's own header comment for what it is: the read-only
// counterpart to UpdateEventDialog, opened by Day.jsx's handleUpdateEvent whenever the clicked
// appointment belongs to a shop-mate rather than the viewer (evt.userId !== user.id) - see
// Day.test.jsx's "clicking someone else's event opens the read-only ViewEventDialog". No
// mutations, no editable fields, and (unlike UpdateEventDialog) no Apollo/router dependency at
// all, so this file needs neither MockedProvider nor MemoryRouter.
//
// NOTE ON resolveTagColor: this checkout has no src/utils/tagColor.js on disk (confirmed by an
// exhaustive search - it's imported by this component, Day.jsx, and AppointmentTypeChip.jsx, but
// the module itself isn't present anywhere in the tree). The colour assertions below are written
// against its DOCUMENTED contract rather than its source: the neutral fallback value
// rgb(95, 99, 104) is pinned in two independent existing suites
// (AppointmentTypeChip.test.jsx's "falls back to the neutral tag colour when the owner has none
// set" and Day.test.jsx's matching case), and the "a literal white tagColor must also fall back"
// rule is this component's OWN header comment, not a guess. If tagColor.js is genuinely absent
// from the real project (not just this partial checkout), this suite - and the two existing ones
// above - will fail on module resolution regardless of anything in this file.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import ViewEventDialog from "./ViewEventDialog";
import { AuthContext } from "../../context/auth";

const NEUTRAL_TAG_COLOR_RGB = "rgb(95, 99, 104)";

function baseEvent(overrides = {}) {
	return {
		id: "appt-1",
		userId: "artist-2",
		title: "Sleeve touch-up",
		description: "Fixing colour saturation on the outer sleeve",
		appointmentType: "session",
		appointmentDate: "2026-08-01T14:00:00.000Z",
		user: { id: "artist-2", firstName: "Gendry", lastName: "Baratheon", tagColor: "#c69818" },
		project: null,
		...overrides,
	};
}

function renderDialog({ event, contextOverrides = {} } = {}) {
	const contextValue = {
		modal: { isOpen: true, title: "Appointment", content: null },
		setModal: vi.fn(),
		...contextOverrides,
	};
	render(
		<AuthContext.Provider value={contextValue}>
			<ViewEventDialog event={event} />
		</AuthContext.Provider>,
	);
	return contextValue;
}

// Chip's colour lives on the MUI root (an sx-generated class), not on the label span that
// screen.getByText actually returns - unlike Day.jsx's own plain-<div> chip, which is why that
// file's tests can read chip.style directly. Walk up to the real root before asserting on it.
function chipRootFor(label) {
	return screen.getByText(label).closest(".MuiChip-root");
}

describe("ViewEventDialog", () => {
	it("renders the event's title, type, description, and formatted date", () => {
		const event = baseEvent();
		renderDialog({ event });

		expect(screen.getByText("Sleeve touch-up")).toBeInTheDocument();
		expect(screen.getByText("session")).toBeInTheDocument();
		expect(screen.getByText("Fixing colour saturation on the outer sleeve")).toBeInTheDocument();
		// Computed the same way the component does, rather than a hardcoded literal, so this
		// doesn't depend on (or drift with) the test runner's local timezone.
		expect(screen.getByText(moment(event.appointmentDate).format("LLL"))).toBeInTheDocument();
	});

	it("does not render a description paragraph when the event has none", () => {
		const event = baseEvent({ description: null });
		const { container } = render(
			<AuthContext.Provider value={{ modal: { isOpen: true }, setModal: vi.fn() }}>
				<ViewEventDialog event={event} />
			</AuthContext.Provider>,
		);
		expect(container.querySelector(".viewEventDescription")).not.toBeInTheDocument();
	});

	// Same fallback chain as Day.jsx's own displayTitle (see ViewEventDialog.jsx's header comment
	// pointing at it) - a session inherits its Project's title when the Appointment has none.
	it("falls back to the linked project's title when the event has no title of its own", () => {
		const event = baseEvent({
			title: null,
			project: { title: "Half sleeve - koi", client: null },
		});
		renderDialog({ event });

		expect(screen.getByText("Half sleeve - koi")).toBeInTheDocument();
	});

	it("shows 'Untitled' when neither the event nor a project has a title", () => {
		const event = baseEvent({ title: null, project: null });
		renderDialog({ event });

		expect(screen.getByText("Untitled")).toBeInTheDocument();
	});

	it("renders the artist's full name and tag colour on the chip", () => {
		const event = baseEvent({
			user: { id: "artist-2", firstName: "Gendry", lastName: "Baratheon", tagColor: "#c69818" },
		});
		renderDialog({ event });

		expect(chipRootFor("Gendry Baratheon")).toHaveStyle({ backgroundColor: "rgb(198, 152, 24)" });
	});

	// artistName's own fallback chain: "" only when both names are missing.
	it("falls back to 'Artist' as the chip label when the event has no user info at all", () => {
		const event = baseEvent({ user: undefined });
		renderDialog({ event });

		expect(screen.getByText("Artist")).toBeInTheDocument();
	});

	it("falls back to the neutral tag colour when the artist has no tagColor set", () => {
		const event = baseEvent({ user: { id: "artist-2", firstName: "Gendry", lastName: "Baratheon" } });
		renderDialog({ event });

		expect(chipRootFor("Gendry Baratheon")).toHaveStyle({ backgroundColor: NEUTRAL_TAG_COLOR_RGB });
	});

	// The exact bug ViewEventDialog.jsx's own header/inline comments describe: the old
	// `event.user?.tagColor || "#999"` fallback only caught a MISSING tagColor, not one literally
	// stored as white - which rendered an invisible white-chip-on-white-text. resolveTagColor
	// exists specifically to also catch this case.
	it("falls back to the neutral tag colour when the artist's tagColor is literally white", () => {
		const event = baseEvent({
			user: { id: "artist-2", firstName: "Gendry", lastName: "Baratheon", tagColor: "#ffffff" },
		});
		renderDialog({ event });

		const chipRoot = chipRootFor("Gendry Baratheon");
		expect(chipRoot).not.toHaveStyle({ backgroundColor: "rgb(255, 255, 255)" });
		expect(chipRoot).toHaveStyle({ backgroundColor: NEUTRAL_TAG_COLOR_RGB });
	});

	it("renders the linked project's client name when the appointment has one", () => {
		const event = baseEvent({
			project: {
				title: "Half sleeve - koi",
				client: { user: { firstName: "Arya", lastName: "Stark" } },
			},
		});
		renderDialog({ event });

		expect(screen.getByText("Client: Arya Stark")).toBeInTheDocument();
	});

	// Consults and "Other" appointments have no Project at all - see models/Appointment.js and
	// UpdateEventDialog.test.jsx's matching "falls back to a placeholder when the appointment has
	// no project". There's no client line to show at all in that case (this dialog has no
	// placeholder for it, unlike UpdateEventDialog's project field).
	it("does not render a Client line when the appointment has no linked project/client", () => {
		const event = baseEvent({ appointmentType: "consult", project: null });
		renderDialog({ event });

		expect(screen.queryByText(/^Client:/)).not.toBeInTheDocument();
	});

	it("names the artist in the read-only note and offers no edit or delete actions", () => {
		const event = baseEvent({
			user: { id: "artist-2", firstName: "Gendry", lastName: "Baratheon", tagColor: "#c69818" },
		});
		renderDialog({ event });

		expect(
			screen.getByText("This is Gendry Baratheon's appointment - you can only edit your own."),
		).toBeInTheDocument();
		expect(screen.queryByText(/^update$/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/^delete$/i)).not.toBeInTheDocument();
		expect(screen.getByText("Close")).toBeInTheDocument();
	});

	it("clicking Close closes the modal without touching the rest of the modal state", async () => {
		const user = userEvent.setup();
		const event = baseEvent();
		const contextValue = renderDialog({
			event,
			contextOverrides: { modal: { isOpen: true, title: "Appointment", content: <div /> } },
		});

		await user.click(screen.getByText("Close"));

		expect(contextValue.setModal).toHaveBeenCalledTimes(1);
		expect(contextValue.setModal).toHaveBeenCalledWith({
			isOpen: false,
			title: "Appointment",
			content: contextValue.modal.content,
		});
	});
});
