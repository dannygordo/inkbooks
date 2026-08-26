// ClientDashboard.jsx tests. See the component's own header comment on why this same component
// mounts in two places with different scoping (isSelf) - Notes/Flags/SharedImages/
// SendAutoResponseButton are shop-side only, and the Forms section swaps which query/props it
// uses depending on who's looking.
//
// ClientService.fetchClientDashboard and getClientFlagTypes, plus FormService.getForms and
// getMyFillableForms, are mocked directly rather than driven through MockedProvider - this
// component fans out into four query hooks plus three mutations, the same "don't hand-build a
// MockedProvider mock for every read" reasoning ArtistPerformancePanel.test.jsx uses for its own
// eight hooks. The three mutations (updateClientNotes/raiseClientFlag/resolveClientFlag) still go
// through a real MockedProvider, since useMutation needs a real ApolloClient in context and this
// file's job includes confirming the right variables go out.
//
// SharedImagesPanel and SendAutoResponseButton are mocked out entirely - both have their own full
// test files (SharedImagesPanel.test.jsx, SendAutoResponseButton.test.jsx) and this file's job is
// confirming ClientDashboard mounts/gates them correctly, not re-testing their own internals, the
// same "don't exercise somebody else's test" pattern IBPageActionBar.test.jsx uses for the
// wizards it opens. FormFillOut (its own test file too) is mocked the same way.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import ClientDashboard from "./ClientDashboard";
import { AuthContext } from "../../context/auth";
import ClientService from "../../services/ClientService";
import FormService from "../../services/FormService";
import { ROLES } from "../../constants/auth";

vi.mock("../../services/ClientService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		default: {
			...actual.default,
			fetchClientDashboard: vi.fn(),
			getClientFlagTypes: vi.fn(),
		},
	};
});

vi.mock("../../services/FormService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		default: {
			...actual.default,
			getForms: vi.fn(),
			getMyFillableForms: vi.fn(),
		},
	};
});

vi.mock("./SharedImagesPanel", () => ({
	default: vi.fn(({ clientId }) => (
		<div data-testid="shared-images-panel">{clientId}</div>
	)),
}));

vi.mock("../autoResponses/SendAutoResponseButton", () => ({
	default: vi.fn(({ clientId }) => (
		<div data-testid="send-auto-response">{clientId}</div>
	)),
}));

vi.mock("../forms/FormFillOut", () => ({
	default: vi.fn(({ formId, clientId, onSubmitted, onCancel }) => (
		<div data-testid="form-fill-out">
			<span data-testid="fill-out-form-id">{formId}</span>
			<span data-testid="fill-out-client-id">{clientId ?? "none"}</span>
			<button onClick={onSubmitted}>submitted</button>
			<button onClick={onCancel}>cancel fill out</button>
		</div>
	)),
}));

const CLIENT_ID = "client-1";

function client(overrides = {}) {
	return {
		__typename: "Client",
		id: CLIENT_ID,
		firstName: "Robin",
		lastName: "Client",
		email: "robin@example.com",
		phone: "555-1234",
		avatar: null,
		userId: "user-1",
		stats: {
			totalSpentCents: 500000,
			totalTipsCents: 10000,
			averageTipCents: 5000,
			tippedSessionCount: 2,
			completedSessionCount: 4,
			projectCount: 1,
			upcomingAppointmentCount: 1,
		},
		projects: { items: [], pageInfo: { totalCount: 0, hasMore: false, limit: 10, offset: 0 } },
		appointments: { items: [], pageInfo: { totalCount: 0, hasMore: false, limit: 10, offset: 0 } },
		notes: [],
		flags: [],
		...overrides,
	};
}

function project(overrides = {}) {
	return { id: "proj-1", title: "Full Sleeve", status: "in_progress", createdAt: "2026-07-01T00:00:00.000Z", ...overrides };
}

function appointment(overrides = {}) {
	return {
		id: "appt-1",
		title: null,
		appointmentDate: "2026-08-10T14:00:00.000Z",
		appointmentType: "session",
		appointmentStatus: "scheduled",
		subtotalCents: 40000,
		taxCents: 0,
		feeCents: 0,
		tipCents: 0,
		totalCents: 40000,
		projectId: "proj-1",
		project: { id: "proj-1", title: "Full Sleeve" },
		...overrides,
	};
}

function note(overrides = {}) {
	return {
		id: "note-1",
		author: "Sam Artist",
		note: "Cancels a lot.",
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		...overrides,
	};
}

function flag(overrides = {}) {
	return {
		id: "flag-1",
		typeKey: "LATE",
		note: "",
		systemGenerated: false,
		createdAt: "2026-08-05T00:00:00.000Z",
		type: { key: "LATE", label: "Frequently late" },
		createdBy: { id: "u1", firstName: "Sam", lastName: "Artist" },
		...overrides,
	};
}

function flagType(overrides = {}) {
	return { key: "LATE", label: "Frequently late", systemGenerated: false, ...overrides };
}

function viewer(overrides = {}) {
	return { id: "artist-1", role: ROLES.ARTIST, userInfo: {}, firstName: "Sam", lastName: "Artist", ...overrides };
}

function setupHooks(opts = {}) {
	const { loading = false, flagTypes = [flagType()], forms = [], myForms = [] } = opts;
	// "data" is looked up with an explicit `in` check rather than a destructured default, since
	// this helper's callers need to distinguish "not passed, use the default client()" from
	// "passed as undefined on purpose" (the loading-state test below) - a destructured default
	// only fires on `undefined`, so it can't tell those two apart on its own.
	const data = "data" in opts ? opts.data : { getClient: client() };
	ClientService.fetchClientDashboard.mockReturnValue({ loading, data });
	ClientService.getClientFlagTypes.mockReturnValue({ data: { getClientFlagTypes: flagTypes } });
	FormService.getForms.mockReturnValue({ data: { getForms: { items: forms, pageInfo: { totalCount: forms.length, hasMore: false, limit: 25, offset: 0 } } } });
	FormService.getMyFillableForms.mockReturnValue({ data: { getMyFillableForms: myForms } });
}

function renderDashboard({
	clientId = CLIENT_ID,
	isSelf = false,
	user = viewer(),
	setAlert = vi.fn(),
	modal = { isOpen: false },
	setModal = vi.fn(),
	mocks = [],
} = {}) {
	render(
		<MockedProvider mocks={mocks} addTypename={false}>
			<AuthContext.Provider value={{ user, setAlert, modal, setModal }}>
				<ClientDashboard clientId={clientId} isSelf={isSelf} />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert, modal, setModal };
}

describe("loading", () => {
	it("shows the page loader while the initial fetch is in flight with nothing cached yet", () => {
		setupHooks({ data: undefined, loading: true });
		renderDashboard();

		expect(screen.getByText(/loading/i)).toBeInTheDocument();
	});
});

describe("no client found", () => {
	it("renders nothing when the query resolves with no getClient", () => {
		ClientService.fetchClientDashboard.mockReturnValue({ loading: false, data: { getClient: null } });
		ClientService.getClientFlagTypes.mockReturnValue({ data: { getClientFlagTypes: [] } });
		FormService.getForms.mockReturnValue({ data: undefined });
		FormService.getMyFillableForms.mockReturnValue({ data: undefined });

		const { container } = render(
			<MockedProvider>
				<AuthContext.Provider value={{ user: viewer(), setAlert: vi.fn(), modal: { isOpen: false }, setModal: vi.fn() }}>
					<ClientDashboard clientId={CLIENT_ID} isSelf={false} />
				</AuthContext.Provider>
			</MockedProvider>,
		);

		expect(container).toBeEmptyDOMElement();
	});
});

describe("staff/artist view (isSelf=false)", () => {
	it("labels the stat cards for a viewer looking at someone else's client", () => {
		setupHooks();
		renderDashboard({ isSelf: false });

		expect(screen.getByText("Lifetime value")).toBeInTheDocument();
		expect(screen.getByText("Total tips")).toBeInTheDocument();
		expect(screen.getByText("$5,000.00")).toBeInTheDocument();
		expect(screen.getByText("$100.00")).toBeInTheDocument();
		expect(screen.getByText("$50.00")).toBeInTheDocument();
	});

	it("mounts SendAutoResponseButton and SharedImagesPanel with the clientId", () => {
		setupHooks();
		renderDashboard({ isSelf: false });

		expect(screen.getByTestId("send-auto-response")).toHaveTextContent(CLIENT_ID);
		expect(screen.getByTestId("shared-images-panel")).toHaveTextContent(CLIENT_ID);
	});

	it("shows the empty message when there are no projects or appointments", () => {
		setupHooks();
		renderDashboard({ isSelf: false });

		expect(screen.getByText("No projects yet.")).toBeInTheDocument();
		expect(screen.getByText("No appointments yet.")).toBeInTheDocument();
	});

	it("renders a project row, falling back to 'Untitled project' when there's no title", () => {
		setupHooks({
			data: {
				getClient: client({
					projects: {
						// Noon UTC, not midnight - `createdAt` is rendered via `moment(...).format(...)`
						// in the reader's own local timezone, so a midnight-UTC fixture rolls back to
						// the previous day for anyone west of Greenwich (same fix as
						// ShopCutRatePanel.test.jsx's "since Jan 1, 2026" assertion).
						items: [
							project({ title: null, createdAt: "2026-07-01T12:00:00.000Z" }),
							// Distinct date from the row above (also noon UTC, same reasoning) - both
							// rows otherwise share `project()`'s default `status`/`createdAt`, which
							// would make the assertion below match twice over instead of once.
							project({ id: "proj-2", title: "Koi Sleeve", createdAt: "2026-06-01T12:00:00.000Z" }),
						],
						pageInfo: { totalCount: 2, hasMore: false, limit: 10, offset: 0 },
					},
				}),
			},
		});
		renderDashboard({ isSelf: false });

		expect(screen.getByText("Untitled project")).toBeInTheDocument();
		expect(screen.getByText("Koi Sleeve")).toBeInTheDocument();
		expect(screen.getByText(/in_progress - started Jul 1, 2026/)).toBeInTheDocument();
	});

	it("renders an appointment row with its date, status and totals", () => {
		setupHooks({
			data: {
				getClient: client({
					appointments: {
						items: [appointment({ tipCents: 5000 })],
						pageInfo: { totalCount: 1, hasMore: false, limit: 10, offset: 0 },
					},
				}),
			},
		});
		renderDashboard({ isSelf: false });

		expect(screen.getByText("Full Sleeve")).toBeInTheDocument();
		expect(
			screen.getByText(/Aug 10, 2026 .*scheduled.*\$400\.00.*\(incl\. \$50\.00 tip\)/),
		).toBeInTheDocument();
	});

	it("falls back through appointment.title, then project.title, to 'Untitled'", () => {
		setupHooks({
			data: {
				getClient: client({
					appointments: {
						items: [appointment({ title: null, project: null, totalCents: 0 })],
						pageInfo: { totalCount: 1, hasMore: false, limit: 10, offset: 0 },
					},
				}),
			},
		});
		renderDashboard({ isSelf: false });

		expect(screen.getByText("Untitled")).toBeInTheDocument();
	});

	it("re-queries fetchClientDashboard with the new offset when a list's pager advances", async () => {
		const user = userEvent.setup();
		setupHooks({
			data: {
				getClient: client({
					projects: {
						items: [project()],
						pageInfo: { totalCount: 15, hasMore: true, limit: 10, offset: 0 },
					},
				}),
			},
		});
		renderDashboard({ isSelf: false });

		await user.click(screen.getByRole("button", { name: "Next" }));

		await waitFor(() =>
			expect(ClientService.fetchClientDashboard).toHaveBeenCalledWith(
				CLIENT_ID,
				expect.objectContaining({ offset: 10 }),
				expect.anything(),
			),
		);
	});

	describe("forms (staff view)", () => {
		it("hides the Forms card entirely when the viewer's scope has no published forms", () => {
			setupHooks({ forms: [] });
			renderDashboard({ isSelf: false });

			expect(screen.queryByText("Forms")).not.toBeInTheDocument();
		});

		it("opens the modal with FormFillOut scoped to this client when Fill Out is clicked", async () => {
			const user = userEvent.setup();
			setupHooks({ forms: [{ id: "form-1", title: "Consent Form" }] });
			const { setModal } = renderDashboard({ isSelf: false });

			await user.click(screen.getByRole("button", { name: "Fill Out" }));

			expect(setModal).toHaveBeenCalledTimes(1);
			const call = setModal.mock.calls[0][0];
			expect(call.isOpen).toBe(true);
			expect(call.title).toBe("Consent Form");
			render(call.content);
			expect(screen.getByTestId("fill-out-form-id")).toHaveTextContent("form-1");
			expect(screen.getByTestId("fill-out-client-id")).toHaveTextContent(CLIENT_ID);
		});

		it("closes the modal and shows a success alert when FormFillOut reports a submission", async () => {
			const user = userEvent.setup();
			setupHooks({ forms: [{ id: "form-1", title: "Consent Form" }] });
			const { setModal, setAlert, modal } = renderDashboard({ isSelf: false });

			await user.click(screen.getByRole("button", { name: "Fill Out" }));
			const modalContent = setModal.mock.calls[0][0].content;
			render(modalContent);

			await user.click(screen.getByText("submitted"));

			expect(setModal).toHaveBeenCalledWith({ ...modal, isOpen: false });
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success", message: "Response submitted." }),
			);
		});
	});

	describe("notes", () => {
		it("shows the empty message, and reveals the note form when Add note is clicked", async () => {
			const user = userEvent.setup();
			setupHooks();
			renderDashboard({ isSelf: false });

			expect(screen.getByText("No notes yet.")).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Add note" }));

			expect(screen.getByRole("button", { name: "Save note" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
		});

		it("keeps Save note disabled until real text is typed", async () => {
			const user = userEvent.setup();
			setupHooks();
			renderDashboard({ isSelf: false });

			await user.click(screen.getByRole("button", { name: "Add note" }));
			expect(screen.getByRole("button", { name: "Save note" })).toBeDisabled();

			await user.type(screen.getByLabelText("New note"), "Needed a break every 20 minutes");

			expect(screen.getByRole("button", { name: "Save note" })).not.toBeDisabled();
		});

		it("lists existing notes newest first", () => {
			setupHooks({
				data: {
					getClient: client({
						notes: [
							note({ id: "n1", note: "Older note", createdAt: "2026-07-01T00:00:00.000Z" }),
							note({ id: "n2", note: "Newer note", createdAt: "2026-08-01T00:00:00.000Z" }),
						],
					}),
				},
			});
			renderDashboard({ isSelf: false });

			const rendered = screen.getAllByText(/note$/).map((el) => el.textContent);
			expect(rendered.indexOf("Newer note")).toBeLessThan(rendered.indexOf("Older note"));
		});

		it("submits updateClientNotes with the typed note appended and closes the form", async () => {
			const user = userEvent.setup();
			setupHooks();
			// The component stamps id/createdAt/updatedAt from Date.now()/new Date().toISOString(),
			// which this test can't predict - MockedProvider's `variableMatcher` (a sibling of
			// `request`, not a `request.variables` value - see mockLink.js's own
			// normalizeVariableMatching, which throws if both are given) lets this mock accept
			// any variables rather than requiring a byte-for-byte literal match.
			const flexibleMock = {
				request: { query: ClientService.UPDATE_CLIENT_NOTES },
				variableMatcher: (vars) =>
					vars.clientId === CLIENT_ID &&
					vars.notes?.[0]?.note === "New note text" &&
					vars.notes[0].author === "Sam Artist",
				result: { data: { updateClientNotes: { id: CLIENT_ID, notes: [] } } },
			};
			renderDashboard({ isSelf: false, mocks: [flexibleMock] });

			await user.click(screen.getByRole("button", { name: "Add note" }));
			await user.type(screen.getByLabelText("New note"), "New note text");
			await user.click(screen.getByRole("button", { name: "Save note" }));

			await waitFor(() => expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument());
		});

		it("alerts the server's error message when saving a note fails", async () => {
			const user = userEvent.setup();
			setupHooks();
			const failingMock = {
				request: { query: ClientService.UPDATE_CLIENT_NOTES },
				variableMatcher: () => true,
				error: new Error("Could not save note."),
			};
			const { setAlert } = renderDashboard({ isSelf: false, mocks: [failingMock] });

			await user.click(screen.getByRole("button", { name: "Add note" }));
			await user.type(screen.getByLabelText("New note"), "New note text");
			await user.click(screen.getByRole("button", { name: "Save note" }));

			await waitFor(() =>
				expect(setAlert).toHaveBeenCalledWith(
					expect.objectContaining({ isAlert: true, severity: "error", message: "Could not save note." }),
				),
			);
		});
	});

	describe("flags", () => {
		it("shows the empty message and reveals the flag form when Add flag is clicked", async () => {
			const user = userEvent.setup();
			setupHooks();
			renderDashboard({ isSelf: false });

			expect(screen.getByText("No flags on this client.")).toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Add flag" }));

			expect(screen.getByRole("button", { name: "Save flag" })).toBeInTheDocument();
			expect(screen.getByRole("combobox")).toBeInTheDocument();
		});

		it("excludes systemGenerated flag types from the picker", async () => {
			const user = userEvent.setup();
			setupHooks({ flagTypes: [flagType(), flagType({ key: "NO_SHOWED", label: "No-showed", systemGenerated: true })] });
			renderDashboard({ isSelf: false });

			await user.click(screen.getByRole("button", { name: "Add flag" }));

			expect(screen.getByRole("option", { name: "Frequently late" })).toBeInTheDocument();
			expect(screen.queryByRole("option", { name: "No-showed" })).not.toBeInTheDocument();
		});

		it("keeps Save flag disabled until a flag type is chosen", async () => {
			const user = userEvent.setup();
			setupHooks();
			renderDashboard({ isSelf: false });

			await user.click(screen.getByRole("button", { name: "Add flag" }));
			expect(screen.getByRole("button", { name: "Save flag" })).toBeDisabled();

			await user.selectOptions(screen.getByRole("combobox"), "LATE");

			expect(screen.getByRole("button", { name: "Save flag" })).not.toBeDisabled();
		});

		it("submits raiseClientFlag with the chosen type and note", async () => {
			const user = userEvent.setup();
			setupHooks();
			const raiseMock = {
				request: {
					query: ClientService.RAISE_CLIENT_FLAG,
					variables: { input: { clientId: CLIENT_ID, typeKey: "LATE", note: "Third time this month" } },
				},
				result: {
					data: {
						raiseClientFlag: {
							__typename: "ClientFlag",
							id: "flag-9",
							typeKey: "LATE",
							note: "Third time this month",
							systemGenerated: false,
							createdAt: "2026-08-20T00:00:00.000Z",
							type: { __typename: "ClientFlagType", key: "LATE", label: "Frequently late" },
							createdBy: { __typename: "User", id: "u1", firstName: "Sam", lastName: "Artist" },
						},
					},
				},
			};
			renderDashboard({ isSelf: false, mocks: [raiseMock] });

			await user.click(screen.getByRole("button", { name: "Add flag" }));
			await user.selectOptions(screen.getByRole("combobox"), "LATE");
			await user.type(screen.getByLabelText("Note (optional)"), "Third time this month");
			await user.click(screen.getByRole("button", { name: "Save flag" }));

			await waitFor(() => expect(screen.queryByRole("button", { name: "Save flag" })).not.toBeInTheDocument());
		});

		it("alerts the server's error message when raising a flag fails", async () => {
			const user = userEvent.setup();
			setupHooks();
			const failingMock = {
				request: {
					query: ClientService.RAISE_CLIENT_FLAG,
					variables: { input: { clientId: CLIENT_ID, typeKey: "LATE", note: "" } },
				},
				error: new Error("Could not raise flag."),
			};
			const { setAlert } = renderDashboard({ isSelf: false, mocks: [failingMock] });

			await user.click(screen.getByRole("button", { name: "Add flag" }));
			await user.selectOptions(screen.getByRole("combobox"), "LATE");
			await user.click(screen.getByRole("button", { name: "Save flag" }));

			await waitFor(() =>
				expect(setAlert).toHaveBeenCalledWith(
					expect.objectContaining({ isAlert: true, severity: "error", message: "Could not raise flag." }),
				),
			);
		});

		it("shows 'Resolving...' only on the flag row being resolved, keeping other rows clickable", async () => {
			const user = userEvent.setup();
			setupHooks({
				data: {
					getClient: client({
						flags: [flag({ id: "f1" }), flag({ id: "f2", type: { key: "LATE", label: "Frequently late" } })],
					}),
				},
			});
			// Slow enough that the in-flight "Resolving..." state is observable before it resolves.
			const resolveMock = {
				request: { query: ClientService.RESOLVE_CLIENT_FLAG, variables: { flagId: "f1" } },
				result: { data: { resolveClientFlag: { id: "f1", resolvedAt: "2026-08-20T00:00:00.000Z" } } },
				delay: 200,
			};
			renderDashboard({ isSelf: false, mocks: [resolveMock] });

			const resolveButtons = screen.getAllByRole("button", { name: "Resolve" });
			expect(resolveButtons).toHaveLength(2);
			await user.click(resolveButtons[0]);

			expect(screen.getByRole("button", { name: "Resolving..." })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Resolve" })).not.toBeDisabled();

			await waitFor(() => expect(screen.queryByText("Resolving...")).not.toBeInTheDocument());
		});

		it("alerts the server's error message when resolving a flag fails", async () => {
			const user = userEvent.setup();
			setupHooks({ data: { getClient: client({ flags: [flag({ id: "f1" })] }) } });
			const failingMock = {
				request: { query: ClientService.RESOLVE_CLIENT_FLAG, variables: { flagId: "f1" } },
				error: new Error("Could not resolve flag."),
			};
			const { setAlert } = renderDashboard({ isSelf: false, mocks: [failingMock] });

			await user.click(screen.getByRole("button", { name: "Resolve" }));

			await waitFor(() =>
				expect(setAlert).toHaveBeenCalledWith(
					expect.objectContaining({ isAlert: true, severity: "error", message: "Could not resolve flag." }),
				),
			);
		});

		it("marks an automatic flag and still offers Resolve on it", () => {
			setupHooks({
				data: {
					getClient: client({
						flags: [flag({ id: "f1", systemGenerated: true, type: { key: "NO_SHOWED", label: "No-showed" } })],
					}),
				},
			});
			renderDashboard({ isSelf: false });

			expect(screen.getByText("No-showed (automatic)")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
		});
	});
});

describe("client's own view (isSelf=true)", () => {
	it("labels the stat cards for the client looking at themselves", () => {
		setupHooks();
		renderDashboard({ isSelf: true });

		expect(screen.getByText("Total spent")).toBeInTheDocument();
		expect(screen.getByText("Total tipped")).toBeInTheDocument();
	});

	it("never mounts SendAutoResponseButton or SharedImagesPanel", () => {
		setupHooks();
		renderDashboard({ isSelf: true });

		expect(screen.queryByTestId("send-auto-response")).not.toBeInTheDocument();
		expect(screen.queryByTestId("shared-images-panel")).not.toBeInTheDocument();
	});

	it("never shows the Notes or Flags cards", () => {
		setupHooks();
		renderDashboard({ isSelf: true });

		expect(screen.queryByText("Notes")).not.toBeInTheDocument();
		expect(screen.queryByText("Flags")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();
	});

	it("uses getMyFillableForms and omits clientId from the self-service Fill Out", async () => {
		const user = userEvent.setup();
		setupHooks({ myForms: [{ id: "form-2", title: "Intake Questionnaire" }] });
		const { setModal } = renderDashboard({ isSelf: true });

		// getForms is skipped for a client's own view (no shop/artist scope to look up forms by);
		// getMyFillableForms is skipped the other way, for the staff/artist view.
		expect(FormService.getForms).toHaveBeenCalledWith(expect.anything(), "published", expect.anything(), { skip: true });
		expect(FormService.getMyFillableForms).toHaveBeenCalledWith({ skip: false });

		expect(screen.getByText("Forms your artist or shop has asked you to fill out.")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Fill Out" }));

		render(setModal.mock.calls[0][0].content);
		expect(screen.getByTestId("fill-out-form-id")).toHaveTextContent("form-2");
		expect(screen.getByTestId("fill-out-client-id")).toHaveTextContent("none");
	});
});
