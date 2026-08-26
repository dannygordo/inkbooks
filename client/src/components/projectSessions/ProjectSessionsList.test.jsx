// ProjectSessionsList.jsx tests. See the component's own header comment: every session-type
// appointment tied to a project, oldest first, with "+ Add Session" to book another one directly
// against the project, and a row click opening SessionDetail in the global modal.
//
// AppointmentService.getAppointmentsByProject and ArtistShopConnectionService.
// fetchArtistShopConnections are mocked directly (same "don't hand-build a MockedProvider mock for
// every read" reasoning ArtistPerformancePanel.test.jsx uses for its own query hooks) - only
// CREATE_APPOINTMENT goes through a real MockedProvider, since useMutation needs a real
// ApolloClient in context and this file's job includes confirming the right variables go out.
//
// AppointmentSlotPicker and SessionDetail are mocked out entirely - both have their own full test
// files (AppointmentSlotPicker.test.jsx, SessionDetail.test.jsx) and this file's job is confirming
// ProjectSessionsList wires the right props/callbacks into them, not re-testing their own
// internals, the same "don't exercise somebody else's test" pattern IBPageActionBar.test.jsx uses
// for the wizards it opens.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import { MockedProvider } from "@apollo/client/testing";
import ProjectSessionsList from "./ProjectSessionsList";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";
import ArtistShopConnectionService from "../../services/ArtistShopConnectionService";
import { SESSION_DEFAULT_MINUTES } from "../appointments/DurationPicker";

vi.mock("../../services/AppointmentService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		AppointmentService: {
			...actual.AppointmentService,
			getAppointmentsByProject: vi.fn(),
		},
	};
});

vi.mock("../../services/ArtistShopConnectionService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		default: {
			...actual.default,
			fetchArtistShopConnections: vi.fn(),
		},
	};
});

vi.mock("../appointments/AppointmentSlotPicker", () => ({
	default: vi.fn(({ label, date, durationMinutes, onDateChange, onDurationChange, artistUserId }) => (
		<div data-testid="slot-picker">
			<span data-testid="slot-picker-label">{label}</span>
			<span data-testid="slot-picker-artist">{artistUserId}</span>
			<span data-testid="slot-picker-duration">{durationMinutes}</span>
			{/* type="button" is load-bearing, not decorative: this stub renders inside
			    ProjectSessionsList's own real <form onSubmit={handleAddSession}>, and a plain
			    <button> with no explicit type defaults to type="submit" - clicking "set date"
			    was submitting the form on the spot (with whatever stale date/duration state was
			    still in scope), well before the test's own later click on "Save", so the mutation
			    was already in flight (the button already read "Saving...") by the time these tests
			    tried to interact with the real Save/Cancel buttons. The real AppointmentSlotPicker
			    only ever renders MUI controls, none of which default to a submit type, so this was
			    purely an artifact of this stub, not something the real component does too. */}
			<button type="button" onClick={() => onDateChange(moment("2026-09-01T15:00:00.000Z"))}>
				set date
			</button>
			<button type="button" onClick={() => onDurationChange(90)}>
				set duration
			</button>
		</div>
	)),
}));

vi.mock("./SessionDetail", () => ({
	default: vi.fn(({ appointment, project, connections, onClosed, onDeleted }) => (
		<div data-testid="session-detail">
			<span data-testid="session-detail-appointment-id">{appointment.id}</span>
			<span data-testid="session-detail-project-id">{project.id}</span>
			<span data-testid="session-detail-connections-count">{connections.length}</span>
			<button onClick={onClosed}>close session</button>
			<button onClick={onDeleted}>delete session</button>
		</div>
	)),
}));

function project(overrides = {}) {
	return {
		id: "proj-1",
		title: "Full Sleeve",
		artistId: "artist-1",
		artist: { shop: null },
		...overrides,
	};
}

function session(overrides = {}) {
	return {
		id: "sess-1",
		projectId: "proj-1",
		userId: "artist-1",
		shopId: null,
		title: "Full Sleeve",
		description: "",
		appointmentType: "session",
		appointmentDate: "2026-08-10T14:00:00.000Z",
		durationMinutes: 180,
		appointmentEnd: "2026-08-10T17:00:00.000Z",
		appointmentStatus: "scheduled",
		subtotalCents: 0,
		taxCents: 0,
		feeCents: 0,
		tipCents: 0,
		totalCents: 0,
		shopCutCents: 0,
		shopCutStatus: "none",
		shopCutPercentApplied: null,
		depositCents: 0,
		depositStatus: null,
		depositCreditCents: 0,
		depositCreditFromAppointmentId: null,
		timerStatus: "stopped",
		timerStartedAt: null,
		accumulatedSeconds: 0,
		sessionNotes: "",
		adjustments: [],
		...overrides,
	};
}

function connection(overrides = {}) {
	return { id: "conn-1", artistId: "artist-1", shopId: "shop-1", status: "active", rateSource: "shop", ...overrides };
}

function setupHooks({ sessions = [], loading = false, refetch = vi.fn(), connections = [] } = {}) {
	AppointmentService.getAppointmentsByProject.mockReturnValue({
		data: { getAppointmentsByProject: sessions },
		loading,
		refetch,
	});
	ArtistShopConnectionService.fetchArtistShopConnections.mockReturnValue({
		data: { getArtistShopConnections: connections },
	});
	return { refetch };
}

function renderList({
	projectOverrides = {},
	setAlert = vi.fn(),
	modal = { isOpen: false },
	setModal = vi.fn(),
	mocks = [],
} = {}) {
	const proj = project(projectOverrides);
	const { container } = render(
		<MockedProvider mocks={mocks} addTypename={false}>
			<AuthContext.Provider value={{ setModal, modal, setAlert }}>
				<ProjectSessionsList project={proj} />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert, modal, setModal, project: proj, container };
}

describe("loading", () => {
	it("shows a loading message while the query is in flight", () => {
		setupHooks({ loading: true });
		renderList();

		expect(screen.getByText("Loading sessions...")).toBeInTheDocument();
	});
});

describe("no sessions yet", () => {
	it("shows the empty message and the Add Session button", () => {
		setupHooks({ sessions: [] });
		renderList();

		expect(screen.getByText("No sessions yet.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add Session" })).toBeInTheDocument();
	});

	it("hides the empty message once the add form is open", async () => {
		const user = userEvent.setup();
		setupHooks({ sessions: [] });
		renderList();

		await user.click(screen.getByRole("button", { name: "Add Session" }));

		expect(screen.queryByText("No sessions yet.")).not.toBeInTheDocument();
		expect(screen.getByTestId("slot-picker")).toBeInTheDocument();
	});
});

describe("session rows", () => {
	it("renders sessions oldest first regardless of input order", () => {
		setupHooks({
			sessions: [
				session({ id: "newer", appointmentDate: "2026-08-20T14:00:00.000Z" }),
				session({ id: "older", appointmentDate: "2026-08-05T14:00:00.000Z" }),
			],
		});
		const { container } = renderList();

		const dates = container.querySelectorAll(".projectSessionRowDate");
		expect(dates).toHaveLength(2);
		expect(dates[0]).toHaveTextContent(moment("2026-08-05T14:00:00.000Z").format("LLL"));
		expect(dates[1]).toHaveTextContent(moment("2026-08-20T14:00:00.000Z").format("LLL"));
	});

	it("labels a completed session and shows its total plus tip", () => {
		setupHooks({
			sessions: [session({ appointmentStatus: "completed", totalCents: 45000, tipCents: 5000 })],
		});
		renderList();

		expect(screen.getByText(/Completed - \$450\.00 \(incl\. \$50\.00 tip\)/)).toBeInTheDocument();
	});

	it("labels a non-completed session as Open with no total shown when there isn't one", () => {
		setupHooks({ sessions: [session({ appointmentStatus: "scheduled", totalCents: 0, tipCents: 0 })] });
		renderList();

		expect(screen.getByText("Open")).toBeInTheDocument();
	});

	it("opens the modal with SessionDetail scoped to the clicked session on row click", async () => {
		const user = userEvent.setup();
		setupHooks({
			sessions: [session({ id: "sess-1" })],
			connections: [connection()],
		});
		const { setModal, project: proj } = renderList();

		await user.click(screen.getByText(moment("2026-08-10T14:00:00.000Z").format("LLL")));

		expect(setModal).toHaveBeenCalledTimes(1);
		const call = setModal.mock.calls[0][0];
		expect(call.isOpen).toBe(true);
		expect(call.title).toBe(`Session - ${moment("2026-08-10T14:00:00.000Z").format("LLL")}`);
		render(call.content);
		expect(screen.getByTestId("session-detail-appointment-id")).toHaveTextContent("sess-1");
		expect(screen.getByTestId("session-detail-project-id")).toHaveTextContent(proj.id);
		expect(screen.getByTestId("session-detail-connections-count")).toHaveTextContent("1");
	});

	it("closes the modal and refetches when SessionDetail reports closed", async () => {
		const user = userEvent.setup();
		const { refetch } = setupHooks({ sessions: [session()] });
		const { setModal, modal } = renderList();

		await user.click(screen.getByText(moment("2026-08-10T14:00:00.000Z").format("LLL")));
		render(setModal.mock.calls[0][0].content);

		await user.click(screen.getByText("close session"));

		expect(setModal).toHaveBeenCalledWith({ ...modal, isOpen: false });
		expect(refetch).toHaveBeenCalled();
	});

	it("closes the modal and refetches when SessionDetail reports a delete", async () => {
		const user = userEvent.setup();
		const { refetch } = setupHooks({ sessions: [session()] });
		const { setModal, modal } = renderList();

		await user.click(screen.getByText(moment("2026-08-10T14:00:00.000Z").format("LLL")));
		render(setModal.mock.calls[0][0].content);

		await user.click(screen.getByText("delete session"));

		expect(setModal).toHaveBeenCalledWith({ ...modal, isOpen: false });
		expect(refetch).toHaveBeenCalled();
	});
});

describe("adding a session", () => {
	it("passes the project's artist and the default duration into AppointmentSlotPicker", async () => {
		const user = userEvent.setup();
		setupHooks({ sessions: [] });
		renderList();

		await user.click(screen.getByRole("button", { name: "Add Session" }));

		expect(screen.getByTestId("slot-picker-artist")).toHaveTextContent("artist-1");
		expect(screen.getByTestId("slot-picker-duration")).toHaveTextContent(String(SESSION_DEFAULT_MINUTES));
	});

	it("cancels back to the Add Session button without saving", async () => {
		const user = userEvent.setup();
		setupHooks({ sessions: [] });
		renderList();

		await user.click(screen.getByRole("button", { name: "Add Session" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(screen.queryByTestId("slot-picker")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add Session" })).toBeInTheDocument();
	});

	it("submits createAppointment scoped to the project's own artist (not the viewer), with shopCutStatus 'unpaid' when the artist is shop-connected", async () => {
		const user = userEvent.setup();
		const { refetch } = setupHooks({ sessions: [] });
		const createMock = {
			request: { query: AppointmentService.CREATE_APPOINTMENT },
			// The mutation's own createdAt/updatedAt come from `new Date().toISOString()` at
			// submit time, which this test can't predict - matched with a `variableMatcher`
			// (a sibling of `request`, not `request.variables` - see mockLink.js's own
			// normalizeVariableMatching) instead of a literal variables object.
			variableMatcher: (vars) => {
				const input = vars.appointmentInput;
				return (
					input.projectId === "proj-1" &&
					input.userId === "artist-1" &&
					input.shopId === "shop-1" &&
					input.title === "Full Sleeve" &&
					input.appointmentType === "session" &&
					input.shopCutStatus === "unpaid" &&
					input.appointmentStatus === "scheduled" &&
					input.appointmentDate === moment("2026-09-01T15:00:00.000Z").toISOString() &&
					input.durationMinutes === 90
				);
			},
			result: {
				data: {
					createAppointment: {
						id: "sess-new",
						projectId: "proj-1",
						userId: "artist-1",
						shopId: "shop-1",
						isPersonal: false,
						project: { id: "proj-1", designImages: [] },
						user: { id: "artist-1", firstName: "Sam", lastName: "Artist", tagColor: "#c69818" },
						title: "Full Sleeve",
						description: null,
						appointmentType: "session",
						appointmentDate: moment("2026-09-01T15:00:00.000Z").toISOString(),
						durationMinutes: 90,
						appointmentEnd: null,
						shopCutStatus: "unpaid",
						shopCutCents: 0,
					},
				},
			},
		};
		renderList({ projectOverrides: { artist: { shop: { id: "shop-1" } } }, mocks: [createMock] });

		await user.click(screen.getByRole("button", { name: "Add Session" }));
		await user.click(screen.getByText("set date"));
		await user.click(screen.getByText("set duration"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.queryByTestId("slot-picker")).not.toBeInTheDocument());
		expect(refetch).toHaveBeenCalled();
	});

	it("sends shopCutStatus 'none' for an independent artist's project (no shop)", async () => {
		const user = userEvent.setup();
		setupHooks({ sessions: [] });
		const createMock = {
			request: { query: AppointmentService.CREATE_APPOINTMENT },
			variableMatcher: (vars) => vars.appointmentInput.shopId === undefined && vars.appointmentInput.shopCutStatus === "none",
			result: {
				data: {
					createAppointment: {
						id: "sess-new",
						projectId: "proj-1",
						userId: "artist-1",
						shopId: null,
						isPersonal: false,
						project: { id: "proj-1", designImages: [] },
						user: { id: "artist-1", firstName: "Sam", lastName: "Artist", tagColor: "#c69818" },
						title: "Full Sleeve",
						description: null,
						appointmentType: "session",
						appointmentDate: moment("2026-09-01T15:00:00.000Z").toISOString(),
						durationMinutes: SESSION_DEFAULT_MINUTES,
						appointmentEnd: null,
						shopCutStatus: "none",
						shopCutCents: 0,
					},
				},
			},
		};
		renderList({ mocks: [createMock] });

		await user.click(screen.getByRole("button", { name: "Add Session" }));
		await user.click(screen.getByText("set date"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.queryByTestId("slot-picker")).not.toBeInTheDocument());
	});

	it("shows the server's error inline and alerts it when creating a session fails", async () => {
		const user = userEvent.setup();
		setupHooks({ sessions: [] });
		const failingMock = {
			request: { query: AppointmentService.CREATE_APPOINTMENT },
			variableMatcher: () => true,
			error: new Error("Could not create appointment."),
		};
		const { setAlert } = renderList({ mocks: [failingMock] });

		await user.click(screen.getByRole("button", { name: "Add Session" }));
		await user.click(screen.getByText("set date"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(await screen.findByText("Could not create appointment.")).toBeInTheDocument();
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error", message: "Could not create appointment." }),
			),
		);
		// The form stays open with the error visible rather than being dismissed on failure.
		expect(screen.getByTestId("slot-picker")).toBeInTheDocument();
	});

	it("disables Save and Cancel while the mutation is saving", async () => {
		const user = userEvent.setup();
		setupHooks({ sessions: [] });
		const slowMock = {
			request: { query: AppointmentService.CREATE_APPOINTMENT },
			variableMatcher: () => true,
			result: {
				data: {
					createAppointment: {
						id: "sess-new",
						projectId: "proj-1",
						userId: "artist-1",
						shopId: null,
						isPersonal: false,
						project: { id: "proj-1", designImages: [] },
						user: { id: "artist-1", firstName: "Sam", lastName: "Artist", tagColor: "#c69818" },
						title: "Full Sleeve",
						description: null,
						appointmentType: "session",
						appointmentDate: moment("2026-09-01T15:00:00.000Z").toISOString(),
						durationMinutes: SESSION_DEFAULT_MINUTES,
						appointmentEnd: null,
						shopCutStatus: "none",
						shopCutCents: 0,
					},
				},
			},
			// Long enough that this test's assertions run well before it resolves - see this
			// codebase's own convention for an in-flight assertion that never awaits the after-state.
			delay: 60 * 1000,
		};
		renderList({ mocks: [slowMock] });

		await user.click(screen.getByRole("button", { name: "Add Session" }));
		await user.click(screen.getByText("set date"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
	});
});
