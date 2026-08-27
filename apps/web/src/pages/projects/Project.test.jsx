// Project.jsx tests. This page owns its own fetchProject query, a second query
// (AppointmentService.getAppointmentsByProject) used only to decide whether any session is still
// open for "Add Deposit" purposes, several small edit-on-blur/on-Enter panels (Details autosave,
// Notes, Tags), the image-collection update/tag callbacks it hands to IBImagesList, and the
// "Add Deposit" top-up flow against the project's consult appointment. It then hands off to a
// handful of larger children (ProjectSessionsList, IBChatBox, IBImagesUpload, IBImagesList,
// IBProjectPalettesSelect) for their own rendering.
//
// Those children are mocked out with vi.mock rather than exercised for real: ProjectSessionsList
// runs its own GraphQL queries/mutations (AppointmentService.getAppointmentsByProject again, plus
// ArtistShopConnectionService, CREATE_APPOINTMENT), IBChatBox opens a socket connection and talks
// to MessengerService, and IBImagesUpload/IBImagesList pull in an upload pipeline and a lightbox
// library. None of that belongs to what Project.jsx itself is responsible for - see each of those
// components' own future test files. Mocking them here keeps this file's mocks focused on
// ProjectService/AppointmentService/DepositService, and lets these tests assert the one thing
// Project.jsx actually controls about each child: that it's mounted with the right data and the
// right callbacks. IBProjectPalettesSelect is mocked too, purely so its onChange (which Project.jsx
// wires straight into the same autosave path as every other Details field) can be triggered
// without driving MUI's Select popup.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import { gql } from "@apollo/client";
import { UpdateProjectDocument } from "@inkbooks/api";
import Project from "./Project";
import { AuthContext } from "../../context/auth";
import ProjectService from "../../services/ProjectService";
import DepositService from "../../services/DepositService";

// Deterministic stand-in for bson's ObjectID (see handleNotesUpdate, which embeds `new ObjectID()`
// itself - not a string - as a new note's id). A real ObjectID's internal shape can't be
// reconstructed by hand for a mock's expected variables, so the whole module is replaced here.
// Returning a plain object literal from the mocked "constructor" matters: when a function invoked
// via `new` explicitly returns an object, that object (not a fresh `this`) becomes the result - so
// `new ObjectID()` below evaluates to exactly `{ value: "note-fixed-id" }`, a plain object with
// the same prototype/shape a hand-written fixture object also has, which is what makes
// MockedProvider's deep variable-equality check on the notes mutation succeed.
vi.mock("bson", () => ({
	ObjectID: function () {
		return { value: "note-fixed-id" };
	},
}));

vi.mock("../../components/projectSessions/ProjectSessionsList", () => ({
	default: ({ project }) => <div data-testid="sessions-list">{project?.id}</div>,
}));

vi.mock("../../components/ibChatBox/IBChatBox", () => ({
	default: ({ widget, isInputDisabled, conversation, messages }) => (
		<div
			data-testid="chat-box"
			data-widget={String(widget)}
			data-input-disabled={String(isInputDisabled)}
			data-conversation-id={conversation?.id ?? ""}
			data-message-count={messages?.length ?? 0}
		/>
	),
}));

vi.mock("../../components/ibImagesUpload/IBImagesUpload", () => ({
	default: ({ project, title }) => <div data-testid={`images-upload-${title}`}>{project?.id}</div>,
}));

// Exposes the two callbacks Project.jsx hands down (updateCallback/onTagsUpdate) as buttons, so
// tests can trigger them the same way a real IBImagesList row would, without rendering the real
// lightbox-backed component.
vi.mock("../../components/ibImagesList/IBImagesList", () => ({
	default: ({ imageData, imageType, updateCallback, onTagsUpdate }) => (
		<div data-testid={`images-list-${imageType}`}>
			<span data-testid={`images-count-${imageType}`}>{imageData.length}</span>
			{imageData.map((img) => (
				<button key={img.id} onClick={() => updateCallback(img, imageType)}>
					{`delete-${imageType}-${img.id}`}
				</button>
			))}
			{imageData[0] && (
				<button onClick={() => onTagsUpdate(imageData[0], ["retagged"], imageType)}>
					{`retag-${imageType}`}
				</button>
			)}
		</div>
	),
}));

// A faithful-enough stand-in: a real IBProjectPalettesSelect (via MUI's Select) writes the chosen
// value onto the same inputRef Project.jsx reads in buildDetailsPayload, then calls onChange - this
// mock does both explicitly rather than opening a real MUI popup menu.
vi.mock("../../components/inputs/IBProjectPalettesSelect", () => ({
	default: ({ inputRef, defaultValue, onChange }) => (
		<button
			onClick={() => {
				if (inputRef) inputRef.current = { value: "Black & Grey" };
				onChange({ target: { value: "Black & Grey" } });
			}}
		>
			{`palette-${defaultValue}`}
		</button>
	),
}));

// ---- reconstructed (non-exported) documents -----------------------------------------------------
// ProjectService.FETCH_PROJECT_QUERY and DepositService.RECORD_DEPOSIT are exported directly and
// used as-is below. AppointmentService's getAppointmentsByProject, unlike its getAppointment
// sibling, does not export FETCH_APPOINTMENTS_BY_PROJECT - reconstructed here field-for-field from
// AppointmentService.js's own _FETCH_APPOINTMENTS_BY_PROJECT, the same convention
// FormsPanel.test.jsx documents for ArtistService.fetchArtist. MockedProvider matches by the
// document's printed shape and variables, not reference identity, so this still fails loudly if
// the real query drifts from what's copied here.
const GET_APPOINTMENTS_BY_PROJECT_QUERY = gql`
	query GetAppointmentsByProject($projectId: ID!) {
		getAppointmentsByProject(projectId: $projectId) {
			id
			projectId
			userId
			shopId
			title
			description
			appointmentType
			appointmentDate
			durationMinutes
			appointmentEnd
			appointmentStatus
			subtotalCents
			taxCents
			feeCents
			tipCents
			totalCents
			shopCutCents
			shopCutStatus
			shopCutPercentApplied
			depositCents
			depositStatus
			depositCreditCents
			depositCreditFromAppointmentId
			timerStatus
			timerStartedAt
			accumulatedSeconds
			sessionNotes
			adjustments {
				id
				amountCents
				reason
				createdAt
				createdBy {
					id
					firstName
					lastName
				}
			}
		}
	}
`;

// ProjectService.js's _updateProject returns this document unchanged (see that file's own
// comment on why nothing there reads its `project` argument) - generated from
// packages/api/src/operations/updateProject.graphql by GraphQL Code Generator, so importing it
// directly here (rather than hand-copying the selection set, as this file used to) means this
// mock can never silently drift from what ProjectService.updateProject() actually returns.
const UPDATE_PROJECT_MUTATION = UpdateProjectDocument;

// ---- fixtures ------------------------------------------------------------------------------------

// artist.id ("artist-1") is what's actually compared against the logged-in user's id for
// IBChatBox's isInputDisabled - see renderProject's default auth value below. artist.user.id
// ("user-artist-1") is a deliberately different value: the two are separate fields on the real
// query and this keeps the fixture honest about that, even though Project.jsx's own comparison
// only ever reads the former.
function project(overrides = {}) {
	return {
		__typename: "Project",
		id: "project-1",
		title: "Half sleeve - koi",
		description: "Full color koi half sleeve",
		placement: "Right arm",
		size: "Large",
		palette: "Color",
		artistId: "artist-1",
		artist: {
			__typename: "Artist",
			firstName: "Gendry",
			lastName: "Baratheon",
			email: "gendry@example.com",
			id: "artist-1",
			hourlyRate: 150,
			flatRate: null,
			billingType: "hourly",
			user: { __typename: "User", id: "user-artist-1" },
			shop: {
				__typename: "Shop",
				id: "shop-1",
				name: "Winterfell Ink",
				hourlyRate: 150,
				flatRate: null,
				billingType: "hourly",
			},
		},
		clientId: "client-1",
		client: {
			__typename: "Client",
			firstName: "Arya",
			lastName: "Stark",
			email: "arya@example.com",
			id: "client-1",
		},
		conversation: {
			__typename: "Conversation",
			id: "conv-1",
			members: ["user-artist-1", "client-1"],
			membersInfo: [],
			messages: [
				{
					__typename: "Message",
					id: "msg-1",
					conversationId: "conv-1",
					senderId: "user-artist-1",
					user: { __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null },
					message: "See you Tuesday",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		referenceImages: [],
		bodyImages: [],
		designImages: [],
		materialsUsed: null,
		notes: [],
		tags: [],
		status: "in_progress",
		depositCollectedCents: 0,
		depositAvailableCents: 0,
		deposits: [],
		consultAppointment: null,
		...overrides,
	};
}

function referenceImage(overrides = {}) {
	return {
		__typename: "IBImage",
		id: "img-1",
		url: "https://storage.example.com/img-1.png",
		avatar: null,
		title: "Ref 1",
		uploadedByDisplayName: "Gendry Baratheon",
		userId: "user-artist-1",
		userInfo: {
			__typename: "User",
			firstName: "Gendry",
			lastName: "Baratheon",
			avatar: null,
			id: "user-artist-1",
		},
		tags: ["outline"],
		updatedAt: "2026-01-01T00:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function session(overrides = {}) {
	return {
		__typename: "Appointment",
		id: "session-1",
		projectId: "project-1",
		userId: "user-artist-1",
		shopId: "shop-1",
		title: "Session 1",
		description: null,
		appointmentType: "session",
		appointmentDate: "2026-09-01T15:00:00.000Z",
		durationMinutes: 120,
		appointmentEnd: "2026-09-01T17:00:00.000Z",
		appointmentStatus: "completed",
		subtotalCents: 30000,
		taxCents: 0,
		feeCents: 0,
		tipCents: 0,
		totalCents: 30000,
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
		sessionNotes: null,
		adjustments: [],
		...overrides,
	};
}

function consultAppointment(overrides = {}) {
	return {
		__typename: "Appointment",
		id: "consult-1",
		depositCents: 5000,
		depositStatus: "pending",
		depositPaymentMethod: "cash",
		depositCollectedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function deposit(overrides = {}) {
	return {
		__typename: "Deposit",
		id: "deposit-1",
		depositCents: 5000,
		depositPaymentMethod: "cash",
		depositCollectedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// Full return-selection shape for UPDATE_PROJECT_MUTATION - fixed regardless of what the input
// variables contained, so every mutation mock's `result` needs all of these fields even when a
// given call only ever SENT one or two of them (see e.g. handleNotesUpdate/handleTagsUpdate, which
// each send a different partial ProjectInput). `base` is normally the same project() fixture the
// initial fetch used, so the round trip looks consistent.
function updateProjectResult(base, overrides = {}) {
	return {
		__typename: "Project",
		id: base.id,
		title: base.title,
		description: base.description,
		placement: base.placement,
		size: base.size,
		palette: base.palette,
		artistId: base.artistId,
		clientId: base.clientId,
		referenceImages: base.referenceImages || [],
		bodyImages: base.bodyImages || [],
		designImages: base.designImages || [],
		materialsUsed: base.materialsUsed ?? null,
		notes: base.notes || [],
		tags: base.tags || [],
		status: base.status,
		depositCollectedCents: base.depositCollectedCents ?? 0,
		depositAvailableCents: base.depositAvailableCents ?? 0,
		...overrides,
	};
}

function projectMock(projectId, data) {
	return {
		request: { query: ProjectService.FETCH_PROJECT_QUERY, variables: { projectId } },
		result: { data: { getProject: data } },
	};
}

function projectErrorMock(projectId, error = new Error("Network error")) {
	return {
		request: { query: ProjectService.FETCH_PROJECT_QUERY, variables: { projectId } },
		error,
	};
}

function sessionsMock(projectId, items = []) {
	return {
		request: { query: GET_APPOINTMENTS_BY_PROJECT_QUERY, variables: { projectId } },
		result: { data: { getAppointmentsByProject: items } },
	};
}

function updateProjectMock(payload, result) {
	return {
		request: { query: UPDATE_PROJECT_MUTATION, variables: { project: payload } },
		result: { data: { updateProject: result } },
	};
}

// Second route target purely so a test can prove the client chip's navigate() call landed on the
// real destination, the same way ConsultDetail.test.jsx and Client.test.jsx exercise routing for
// real rather than mocking useNavigate.
function NavigatedClientMarker() {
	const { clientId } = useParams();
	return <div data-testid="navigated-client">{clientId}</div>;
}

function renderProject({ projectId = "project-1", mocks = [], auth = {} } = {}) {
	const authValue = {
		user: {
			id: "artist-1",
			userInfo: { id: "artist-1", firstName: "Gendry", lastName: "Baratheon" },
		},
		setModal: vi.fn(),
		modal: { isOpen: false },
		setAlert: vi.fn(),
		...auth,
	};
	const utils = render(
		<MemoryRouter initialEntries={[`/projects/${projectId}`]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={authValue}>
					<Routes>
						<Route path="/projects/:projectId" element={<Project />} />
						<Route path="/client/:clientId" element={<NavigatedClientMarker />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { ...utils, auth: authValue };
}

// ---- loading and error states ----------------------------------------------------------------

describe("loading and error states", () => {
	it("shows the page loader while fetchProject is in flight", () => {
		renderProject({ mocks: [projectMock("project-1", project()), sessionsMock("project-1")] });

		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});

	// Project.jsx checks only `loading` and `data`, never `error` - so a query that errors out
	// (data stays undefined) falls into the exact same final `else` branch as a project that
	// genuinely doesn't exist, and shows the same message. That's the real, literal behavior being
	// asserted here, not an assumption about how a missing project is distinguished from a network
	// failure.
	it("shows the not-found error card when the project query errors", async () => {
		renderProject({ mocks: [projectErrorMock("project-1"), sessionsMock("project-1")] });

		expect(await screen.findByText("Something Went Wrong!")).toBeInTheDocument();
		expect(screen.getByText("This project does not exist.")).toBeInTheDocument();
	});
});

// ---- rendering project data --------------------------------------------------------------------

describe("rendering project data", () => {
	it("renders the title and a clickable client chip that navigates to the client's page", async () => {
		const user = userEvent.setup();
		renderProject({ mocks: [projectMock("project-1", project()), sessionsMock("project-1")] });

		expect(await screen.findByText("Half sleeve - koi")).toBeInTheDocument();
		const chip = screen.getByRole("button", { name: "Arya Stark" });
		await user.click(chip);

		expect(await screen.findByTestId("navigated-client")).toHaveTextContent("client-1");
	});

	it("renders a static, non-clickable client label when the project has no linked client", async () => {
		const { container } = renderProject({
			mocks: [projectMock("project-1", project({ client: null })), sessionsMock("project-1")],
		});

		await screen.findByText("Half sleeve - koi");
		expect(screen.queryByRole("button", { name: "Arya Stark" })).not.toBeInTheDocument();
		expect(container.querySelector(".projectClientBubbleStatic")).toBeInTheDocument();
	});

	it("passes the project down to ProjectSessionsList and IBChatBox with the right derived flags", async () => {
		renderProject({
			mocks: [projectMock("project-1", project()), sessionsMock("project-1")],
		});

		await screen.findByText("Half sleeve - koi");

		expect(screen.getByTestId("sessions-list")).toHaveTextContent("project-1");

		const chatBox = screen.getByTestId("chat-box");
		expect(chatBox).toHaveAttribute("data-widget", "true");
		// The default logged-in user (id "artist-1") matches the project's own artistId, so the
		// viewer IS this project's artist and the chat input is enabled.
		expect(chatBox).toHaveAttribute("data-input-disabled", "false");
		expect(chatBox).toHaveAttribute("data-conversation-id", "conv-1");
		// activeMessages starts empty and is populated from fetchProject's onCompleted callback
		// with the conversation's own messages array - one message in the fixture.
		await waitFor(() => expect(chatBox).toHaveAttribute("data-message-count", "1"));
	});

	it("disables the chat input for a viewer who is not this project's artist", async () => {
		renderProject({
			mocks: [projectMock("project-1", project()), sessionsMock("project-1")],
			auth: { user: { id: "someone-else", userInfo: { id: "someone-else" } } },
		});

		await screen.findByText("Half sleeve - koi");
		expect(screen.getByTestId("chat-box")).toHaveAttribute("data-input-disabled", "true");
	});

	it("passes each image collection to its own IBImagesUpload/IBImagesList pair", async () => {
		renderProject({
			mocks: [
				projectMock(
					"project-1",
					project({ referenceImages: [referenceImage()], designImages: [], bodyImages: [] }),
				),
				sessionsMock("project-1"),
			],
		});

		await screen.findByText("Half sleeve - koi");

		expect(screen.getByTestId("images-upload-References")).toHaveTextContent("project-1");
		expect(screen.getByTestId("images-upload-Design")).toHaveTextContent("project-1");
		expect(screen.getByTestId("images-upload-Finished Tattoo")).toHaveTextContent("project-1");

		expect(screen.getByTestId("images-count-reference")).toHaveTextContent("1");
		expect(screen.getByTestId("images-count-design")).toHaveTextContent("0");
		expect(screen.getByTestId("images-count-body")).toHaveTextContent("0");
	});
});

// ---- deposit readout ----------------------------------------------------------------------------

describe("deposit readout", () => {
	it("shows 'None taken' when nothing was collected", async () => {
		const { container } = renderProject({
			mocks: [
				projectMock("project-1", project({ depositCollectedCents: 0, deposits: [] })),
				sessionsMock("project-1"),
			],
		});

		await screen.findByText("Half sleeve - koi");
		expect(container.querySelector(".projectDepositValueNone")).toHaveTextContent("None taken");
	});

	it("shows the amount, cash method, and 'still to apply' when a cash deposit is unspent", async () => {
		const { container } = renderProject({
			mocks: [
				projectMock(
					"project-1",
					project({
						depositCollectedCents: 5000,
						depositAvailableCents: 5000,
						deposits: [deposit({ depositCents: 5000, depositPaymentMethod: "cash" })],
					}),
				),
				sessionsMock("project-1"),
			],
		});

		await screen.findByText("Half sleeve - koi");
		const text = container.querySelector(".projectDepositValue").textContent;
		expect(text).toContain("$50.00 taken at consult");
		expect(text).toContain("(Cash)");
		expect(text).toContain("still to apply to a session");
	});

	it("labels a cash-and-card combination and shows 'already applied' once spent", async () => {
		const { container } = renderProject({
			mocks: [
				projectMock(
					"project-1",
					project({
						depositCollectedCents: 9000,
						depositAvailableCents: 0,
						deposits: [
							deposit({ id: "d-1", depositCents: 5000, depositPaymentMethod: "cash" }),
							deposit({ id: "d-2", depositCents: 4000, depositPaymentMethod: "square" }),
						],
					}),
				),
				sessionsMock("project-1"),
			],
		});

		await screen.findByText("Half sleeve - koi");
		const text = container.querySelector(".projectDepositValue").textContent;
		expect(text).toContain("(Cash + Card)");
		expect(text).toContain("already applied to a session");
	});
});

// ---- Add Deposit ----------------------------------------------------------------------------------

describe("Add Deposit", () => {
	it("is not offered when the project has no consult appointment", async () => {
		renderProject({
			mocks: [projectMock("project-1", project({ consultAppointment: null })), sessionsMock("project-1")],
		});

		await screen.findByText("Half sleeve - koi");
		expect(screen.queryByRole("button", { name: "Add Deposit" })).not.toBeInTheDocument();
	});

	it("is not offered once the consult's deposit has already been applied", async () => {
		renderProject({
			mocks: [
				projectMock(
					"project-1",
					project({ consultAppointment: consultAppointment({ depositStatus: "applied" }) }),
				),
				sessionsMock("project-1"),
			],
		});

		await screen.findByText("Half sleeve - koi");
		expect(screen.queryByRole("button", { name: "Add Deposit" })).not.toBeInTheDocument();
	});

	it("is not offered once every session on the project is already closed", async () => {
		renderProject({
			mocks: [
				projectMock("project-1", project({ consultAppointment: consultAppointment() })),
				sessionsMock("project-1", [session({ appointmentStatus: "completed" })]),
			],
		});

		await screen.findByText("Half sleeve - koi");
		expect(screen.queryByRole("button", { name: "Add Deposit" })).not.toBeInTheDocument();
	});

	it("records additional cash against the consult, refetches the project, and alerts success", async () => {
		const user = userEvent.setup();
		const setAlert = vi.fn();
		const initial = project({ consultAppointment: consultAppointment({ depositCents: 5000 }) });
		const refetched = project({
			consultAppointment: consultAppointment({ depositCents: 7500 }),
			depositCollectedCents: 7500,
		});

		renderProject({
			auth: { setAlert },
			mocks: [
				projectMock("project-1", initial),
				sessionsMock("project-1"),
				{
					request: {
						query: DepositService.RECORD_DEPOSIT,
						variables: { appointmentId: "consult-1", depositCents: 7500, paymentMethod: "cash" },
					},
					result: {
						data: {
							recordDeposit: {
								__typename: "Appointment",
								id: "consult-1",
								depositCents: 7500,
								depositStatus: "pending",
								depositCollectedAt: "2026-01-01T00:00:00.000Z",
								depositPaymentMethod: "cash",
								depositSquarePaymentId: null,
								subtotalCents: 0,
								totalCents: 0,
								shopCutCents: 0,
								shopCutStatus: "none",
							},
						},
					},
				},
				// refetchProject() re-issues the exact same query/variables.
				projectMock("project-1", refetched),
			],
		});

		await screen.findByText("Half sleeve - koi");
		await user.click(screen.getByRole("button", { name: "Add Deposit" }));
		await user.type(screen.getByLabelText(/Add to deposit/), "25");
		await user.click(screen.getByRole("button", { name: "Add" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success", message: "Deposit updated." }),
			),
		);
		// The refetched project's higher depositCollectedCents is now on screen.
		await waitFor(() => expect(screen.getByText(/\$75\.00 taken at consult/)).toBeInTheDocument());
	});

	it("rejects a zero amount without calling the mutation", async () => {
		const user = userEvent.setup();
		renderProject({
			mocks: [
				// No RECORD_DEPOSIT mock registered - if handleAddDeposit tried to call it anyway,
				// the resulting mock-mismatch error message would not match the validation copy
				// below, so this assertion also proves no request was attempted.
				projectMock("project-1", project({ consultAppointment: consultAppointment() })),
				sessionsMock("project-1"),
			],
		});

		await screen.findByText("Half sleeve - koi");
		await user.click(screen.getByRole("button", { name: "Add Deposit" }));
		await user.click(screen.getByRole("button", { name: "Add" }));

		expect(await screen.findByText("Enter an amount greater than $0.")).toBeInTheDocument();
	});

	it("shows the server's error message when recordDeposit fails", async () => {
		const user = userEvent.setup();
		renderProject({
			mocks: [
				projectMock(
					"project-1",
					project({ consultAppointment: consultAppointment({ depositCents: 5000 }) }),
				),
				sessionsMock("project-1"),
				{
					request: {
						query: DepositService.RECORD_DEPOSIT,
						variables: { appointmentId: "consult-1", depositCents: 7500, paymentMethod: "cash" },
					},
					error: new Error("That deposit was already applied to a session."),
				},
			],
		});

		await screen.findByText("Half sleeve - koi");
		await user.click(screen.getByRole("button", { name: "Add Deposit" }));
		await user.type(screen.getByLabelText(/Add to deposit/), "25");
		await user.click(screen.getByRole("button", { name: "Add" }));

		expect(
			await screen.findByText("That deposit was already applied to a session."),
		).toBeInTheDocument();
	});
});

// ---- Details autosave ----------------------------------------------------------------------------

describe("Details autosave", () => {
	it("saves the edited title on blur with the full details payload", async () => {
		const user = userEvent.setup();
		const base = project();
		const payload = {
			id: "project-1",
			title: "Half sleeve - koi (touched up)",
			description: base.description,
			placement: base.placement,
			size: base.size,
			palette: base.palette,
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
		};

		renderProject({
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				updateProjectMock(payload, updateProjectResult(base, { title: payload.title })),
			],
		});

		const titleField = await screen.findByLabelText("Title");
		await user.clear(titleField);
		await user.type(titleField, "Half sleeve - koi (touched up)");
		await user.tab();

		await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
	});

	// The dirty check compares against the last payload actually SENT, not against the server's
	// copy - so a second blur producing the identical payload is a no-op. (The very first blur on a
	// freshly mounted page is a separate case: lastSavedDetailsRef starts at null, which never
	// equals a real serialized payload, so that first blur always saves regardless of whether
	// anything changed - the case exercised above, and the reason this test blurs twice rather than
	// once.)
	it("does not resend an unchanged payload on a second blur", async () => {
		const user = userEvent.setup();
		const base = project();
		// The baseline this dirty-check compares against is seeded from the fetched project the
		// moment it loads (see Project.jsx's own lazy-init comment) - a blur that changes nothing
		// is already a no-op on the very FIRST blur, not just the second. So this test has to
		// actually change the field to get a send at all; it was previously written expecting an
		// untouched first blur to fire (autosaving the same value right back), which is exactly the
		// no-op-send bug that baseline exists to prevent - see StaffProfile.test.jsx's matching
		// "does not fire a mutation on blur when nothing changed" test for the other half of this.
		const payload = {
			id: "project-1",
			title: "Half sleeve - koi, revised",
			description: base.description,
			placement: base.placement,
			size: base.size,
			palette: base.palette,
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
		};

		renderProject({
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				// Only ONE update mock - MockedProvider consumes it on the first (actually changed)
				// blur. If the second, identical blur tried to save again, there would be no
				// matching mock left and the save would surface as an error instead of staying
				// "saved".
				updateProjectMock(
					payload,
					updateProjectResult(base, { title: "Half sleeve - koi, revised" }),
				),
			],
		});

		const titleField = await screen.findByLabelText("Title");
		await user.clear(titleField);
		await user.type(titleField, "Half sleeve - koi, revised");
		await user.tab();
		await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());

		titleField.focus();
		await user.tab();

		expect(screen.queryByText("Couldn't save - try again")).not.toBeInTheDocument();
		expect(screen.getByText("All changes saved")).toBeInTheDocument();
	});

	it("shows an error state and alerts when the save fails", async () => {
		const user = userEvent.setup();
		const setAlert = vi.fn();
		const base = project();
		const payload = {
			id: "project-1",
			title: "Half sleeve - koi (touched up)",
			description: base.description,
			placement: base.placement,
			size: base.size,
			palette: base.palette,
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
		};

		renderProject({
			auth: { setAlert },
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				{
					request: { query: UPDATE_PROJECT_MUTATION, variables: { project: payload } },
					error: new Error("Couldn't reach the server"),
				},
			],
		});

		const titleField = await screen.findByLabelText("Title");
		await user.clear(titleField);
		await user.type(titleField, "Half sleeve - koi (touched up)");
		await user.tab();

		await waitFor(() => expect(screen.getByText("Couldn't save - try again")).toBeInTheDocument());
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error" }),
			),
		);
	});

	it("autosaves when a new palette is chosen", async () => {
		const user = userEvent.setup();
		const base = project();
		const payload = {
			id: "project-1",
			title: base.title,
			description: base.description,
			placement: base.placement,
			size: base.size,
			palette: "Black & Grey",
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
		};

		renderProject({
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				updateProjectMock(payload, updateProjectResult(base, { palette: "Black & Grey" })),
			],
		});

		await screen.findByText("Half sleeve - koi");
		await user.click(screen.getByRole("button", { name: "palette-Color" }));

		await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
	});
});

// ---- Notes ----------------------------------------------------------------------------------------

describe("Notes", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-08-22T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("adds a note on Enter, attributed to the logged-in artist, alongside the existing ones", async () => {
		// Only Date is faked (see beforeEach) - setTimeout/etc stay real, so userEvent's own
		// between-keystroke delays don't need any special handling here.
		const user = userEvent.setup();
		const base = project({
			notes: [
				{
					__typename: "IBNote",
					id: "note-0",
					author: "Old Author",
					note: "Initial note",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			],
		});
		const payload = {
			id: "project-1",
			title: base.title,
			description: base.description,
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
			notes: [
				{
					id: "note-0",
					author: "Old Author",
					note: "Initial note",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
				{
					id: { value: "note-fixed-id" },
					author: "Gendry Baratheon",
					note: "Healing well",
					createdAt: "2026-08-22T12:00:00.000Z",
					updatedAt: "2026-08-22T12:00:00.000Z",
				},
			],
		};

		renderProject({
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				updateProjectMock(
					payload,
					updateProjectResult(base, {
						// The response's own note ids don't need to match the (opaque, mocked)
						// ObjectID shape sent in the request - a server would normally hand back its
						// own persisted id. What matters for this test is that BOTH notes are still
						// here afterward, in the same author/text shape that was sent.
						notes: [
							{ __typename: "IBNote", id: "note-0", author: "Old Author", note: "Initial note", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
							{ __typename: "IBNote", id: "note-fixed-id", author: "Gendry Baratheon", note: "Healing well", createdAt: "2026-08-22T12:00:00.000Z", updatedAt: "2026-08-22T12:00:00.000Z" },
						],
					}),
				),
			],
		});

		const addNote = await screen.findByLabelText("Add Note");
		await user.type(addNote, "Healing well{enter}");

		// Only appears once the mutation resolves and its `notes` field merges back into the cached
		// Project by id - so this depends on handleNotesUpdate having sent exactly the payload
		// above (old note preserved, new note attributed to the logged-in artist with the fixed
		// id/timestamp this describe block pins down), not merely on the pre-existing note still
		// being on screen.
		expect(await screen.findByText("Healing well")).toBeInTheDocument();
		expect(screen.getByText("Initial note")).toBeInTheDocument();
	});
});

// ---- Tags -----------------------------------------------------------------------------------------

describe("Tags", () => {
	it("adds a new tag on Enter and reflects it once the mutation resolves", async () => {
		const user = userEvent.setup();
		const base = project({ tags: ["outline"] });
		const payload = {
			id: "project-1",
			tags: ["outline", "koi"],
			title: base.title,
			description: base.description,
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
		};

		renderProject({
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				updateProjectMock(payload, updateProjectResult(base, { tags: ["outline", "koi"] })),
			],
		});

		const addTag = await screen.findByLabelText("Add Tag");
		await user.type(addTag, "koi{enter}");

		// The mutation's response merges into the cache by Project id, so the new tag chip appears
		// via the same watched fetchProject query - no manual refetch involved.
		expect(await screen.findByText("koi")).toBeInTheDocument();
	});

	it("does not add a duplicate tag, and clears the field instead", async () => {
		const user = userEvent.setup();
		renderProject({
			mocks: [
				// No update mock registered - if the duplicate guard failed and a mutation fired
				// anyway, MockedProvider would have nothing to match against it.
				projectMock("project-1", project({ tags: ["outline"] })),
				sessionsMock("project-1"),
			],
		});

		const addTag = await screen.findByLabelText("Add Tag");
		await user.type(addTag, "outline{enter}");

		expect(addTag).toHaveValue("");
	});

	it("removes a tag via the Tags widget's delete action", async () => {
		const user = userEvent.setup();
		const base = project({ tags: ["outline", "koi"] });
		const payload = {
			id: "project-1",
			tags: ["koi"],
			title: base.title,
			description: base.description,
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
		};

		renderProject({
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				updateProjectMock(payload, updateProjectResult(base, { tags: ["koi"] })),
			],
		});

		await screen.findByText("outline");
		// IBTagsWidget renders each tag as an MUI Chip with its own delete (Cancel) icon - two chips
		// means two such icons, so the one to click has to be scoped to the "outline" chip
		// specifically rather than picked arbitrarily off a getAllByTestId list.
		const outlineChip = screen.getByText("outline").closest(".MuiChip-root");
		await user.click(within(outlineChip).getByTestId("CancelIcon"));

		await waitFor(() => expect(screen.queryByText("outline")).not.toBeInTheDocument());
		expect(screen.getByText("koi")).toBeInTheDocument();
	});
});

// ---- Image collections ----------------------------------------------------------------------------

describe("image collections", () => {
	it("deletes a reference image (matched by url) via the References panel's updateCallback", async () => {
		const user = userEvent.setup();
		const kept = referenceImage({ id: "img-2", url: "https://storage.example.com/img-2.png" });
		const deleted = referenceImage({ id: "img-1", url: "https://storage.example.com/img-1.png" });
		const base = project({ referenceImages: [deleted, kept] });
		const strippedKept = {
			id: kept.id,
			url: kept.url,
			avatar: kept.avatar,
			title: kept.title,
			uploadedByDisplayName: kept.uploadedByDisplayName,
			userId: kept.userId,
			tags: kept.tags,
			updatedAt: kept.updatedAt,
			createdAt: kept.createdAt,
		};
		const payload = {
			id: "project-1",
			title: base.title,
			description: base.description,
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
			referenceImages: [strippedKept],
		};

		renderProject({
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				updateProjectMock(
					payload,
					updateProjectResult(base, {
						referenceImages: [{ __typename: "IBImage", ...strippedKept, userInfo: null }],
					}),
				),
			],
		});

		await screen.findByTestId("images-count-reference");
		expect(screen.getByTestId("images-count-reference")).toHaveTextContent("2");
		await user.click(screen.getByRole("button", { name: `delete-reference-${deleted.id}` }));

		await waitFor(() => expect(screen.getByTestId("images-count-reference")).toHaveTextContent("1"));
	});

	it("updates one image's tags via the References panel's onTagsUpdate", async () => {
		const user = userEvent.setup();
		const img = referenceImage({ id: "img-1", tags: ["outline"] });
		const base = project({ referenceImages: [img] });
		const payload = {
			id: "project-1",
			title: base.title,
			description: base.description,
			clientId: base.clientId,
			artistId: base.artistId,
			status: base.status,
			referenceImages: [
				{
					id: img.id,
					url: img.url,
					avatar: img.avatar,
					title: img.title,
					uploadedByDisplayName: img.uploadedByDisplayName,
					userId: img.userId,
					tags: ["retagged"],
					updatedAt: img.updatedAt,
					createdAt: img.createdAt,
				},
			],
		};

		renderProject({
			mocks: [
				projectMock("project-1", base),
				sessionsMock("project-1"),
				updateProjectMock(
					payload,
					updateProjectResult(base, {
						referenceImages: [{ __typename: "IBImage", ...payload.referenceImages[0], userInfo: null }],
					}),
				),
			],
		});

		await screen.findByTestId("images-count-reference");
		await user.click(screen.getByRole("button", { name: "retag-reference" }));

		// Reaching this without an unmatched-mock error is the assertion that onTagsUpdate sent
		// exactly the payload above (every other image field preserved, tags replaced).
		await waitFor(() => expect(screen.getByTestId("images-count-reference")).toHaveTextContent("1"));
	});
});
