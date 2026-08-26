// Forms.jsx tests - the forms MANAGEMENT list (not FormsPanel.jsx's settings-page summary, a
// different component covered in components/settings/FormsPanel.test.jsx). Scoped by
// businessScopeFor like Expenses.jsx (see Expenses.test.jsx, the closest sibling this file
// mirrors for structure: loading/empty/populated states, scope-by-caller, pagination against the
// same EntityListPager, and the row-action mutations), but with no inline add form - "New Form"
// navigates to FormBuilder.jsx instead (see Forms.jsx's own header comment on why an empty draft
// can't legally exist here).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import moment from "moment";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import Forms from "./Forms";
import FormService from "../../services/FormService";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants/auth";

// THE REAL DOCUMENTS, imported from the service - not copies. FormService exports FETCH_FORMS/
// CREATE_FORM/PUBLISH_FORM/ARCHIVE_FORM/SET_FORM_GUEST_ACCESS/DELETE_FORM directly, so mocks below
// reference FormService.FOO rather than reconstructing a local copy of the query text (see
// FormService.js's own header comment on the field-shape strings these are built from).

function formField(overrides = {}) {
	return {
		__typename: "FormField",
		key: "q1",
		type: "short_text",
		label: "Any allergies?",
		helpText: null,
		required: true,
		options: [],
		hidden: false,
		...overrides,
	};
}

function form(overrides = {}) {
	return {
		__typename: "Form",
		id: "form-1",
		shopId: "shop-1",
		artistUserId: null,
		title: "Consent Form",
		description: "",
		status: "draft",
		allowGuestSubmissions: false,
		publicToken: null,
		slug: null,
		shopUseOnly: false,
		systemKey: null,
		fields: [formField()],
		createdByUserId: "user-1",
		createdBy: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon" },
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		...overrides,
	};
}

// page defaults to Forms.jsx's own PAGE_SIZE (25) / initial offset (0), so most callers below only
// need to override it for the pagination suite.
function formsMock({ scope, status = null, page = { limit: 25, offset: 0 }, items = [], pageInfoOverrides = {} }) {
	return {
		request: {
			query: FormService.FETCH_FORMS,
			variables: { ...scope, status, page },
		},
		result: {
			data: {
				getForms: {
					__typename: "FormPage",
					items,
					pageInfo: {
						__typename: "PageInfo",
						totalCount: items.length,
						hasMore: false,
						limit: page.limit,
						offset: page.offset,
						...pageInfoOverrides,
					},
				},
			},
		},
	};
}

const SHOP_ADMIN = { id: "user-1", role: ROLES.SHOP_ADMIN, userInfo: { shop: { id: "shop-1" } } };
const INDEPENDENT_ARTIST = { id: "artist-1", role: ROLES.ARTIST, userInfo: {} };
const SHOP_SCOPE = { shopId: "shop-1" };
const ARTIST_SCOPE = { artistUserId: "artist-1" };

function renderPage({ user = SHOP_ADMIN, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={{ user, setAlert }}>
					<Forms />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { setAlert };
}

describe("loading", () => {
	it("shows the page loader and no rows while getForms is in flight", () => {
		renderPage({ mocks: [formsMock({ scope: SHOP_SCOPE, items: [form()] })] });

		expect(screen.getByRole("progressbar")).toBeInTheDocument();
		expect(screen.queryByText("Consent Form")).not.toBeInTheDocument();
		// Static chrome isn't gated on loading.
		expect(screen.getByText("Forms")).toBeInTheDocument();
	});
});

describe("an empty list", () => {
	it("shows the empty message", async () => {
		renderPage({ mocks: [formsMock({ scope: SHOP_SCOPE, items: [] })] });

		expect(await screen.findByText("No forms yet.")).toBeInTheDocument();
	});
});

describe("a populated list", () => {
	it("renders a form row's title, status, field count, and created date", async () => {
		renderPage({
			mocks: [formsMock({ scope: SHOP_SCOPE, items: [form()] })],
		});

		expect(await screen.findByRole("link", { name: "Consent Form" })).toHaveAttribute(
			"href",
			"/forms/form-1",
		);
		// "Draft" also names one of the always-present status filter tabs above the list (see
		// Forms.jsx's formsFilterBar) - scoped to the row's own status Chip to avoid matching that.
		expect(screen.getByText("Draft", { selector: ".MuiChip-label" })).toBeInTheDocument();
		expect(screen.getByText(/1 field/)).toBeInTheDocument();
		expect(screen.getByText(/created/)).toBeInTheDocument();
		expect(
			screen.getByText(moment("2026-08-01T00:00:00.000Z").format("MMM D, YYYY"), { exact: false }),
		).toBeInTheDocument();
	});

	it("shows a Default chip for a system form and Public link on when guest submissions are allowed", async () => {
		renderPage({
			mocks: [
				formsMock({
					scope: SHOP_SCOPE,
					items: [
						form({
							id: "form-2",
							title: "Booking Request",
							systemKey: "booking_request",
							status: "published",
							allowGuestSubmissions: true,
						}),
					],
				}),
			],
		});

		await screen.findByText("Booking Request");
		expect(screen.getByText("Default")).toBeInTheDocument();
		// The booking_request system form is a stand-in for the real BookingRequest pipeline (see
		// Forms.jsx's own comment) - its "Public link on" suffix never shows even when the flag is
		// set, since isBookingRequest short-circuits that branch.
		expect(screen.queryByText(/Public link on/)).not.toBeInTheDocument();
	});

	it("shows Public link on for a non-system form with guest submissions allowed", async () => {
		renderPage({
			mocks: [
				formsMock({
					scope: SHOP_SCOPE,
					items: [form({ allowGuestSubmissions: true, status: "published" })],
				}),
			],
		});

		expect(await screen.findByText(/Public link on/)).toBeInTheDocument();
	});

	it("shows one field label as singular for a single-field form and plural for multiple fields", async () => {
		renderPage({
			mocks: [
				formsMock({
					scope: SHOP_SCOPE,
					items: [form({ fields: [formField(), formField({ key: "q2" })] })],
				}),
			],
		});

		expect(await screen.findByText(/2 fields/)).toBeInTheDocument();
	});
});

describe("row actions for a regular (non-system) form", () => {
	it("routes Edit to the generic FormBuilder and shows Responses/link-toggle/Duplicate/Delete", async () => {
		renderPage({ mocks: [formsMock({ scope: SHOP_SCOPE, items: [form()] })] });

		await screen.findByText("Consent Form");
		expect(screen.getByRole("link", { name: "Consent Form" })).toHaveAttribute("href", "/forms/form-1");
		expect(screen.getByRole("link", { name: "Responses" })).toHaveAttribute(
			"href",
			"/forms/form-1/responses",
		);
		expect(screen.getByRole("button", { name: "Turn on link" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Edit intake fields" })).not.toBeInTheDocument();
	});

	it("shows Publish for a non-published form and not Archive", async () => {
		renderPage({ mocks: [formsMock({ scope: SHOP_SCOPE, items: [form({ status: "draft" })] })] });

		expect(await screen.findByRole("button", { name: "Publish" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
	});
});

describe("row actions for the booking_request system form", () => {
	it("shows only Edit intake fields, without Responses/link-toggle/Duplicate", async () => {
		renderPage({
			mocks: [
				formsMock({
					scope: SHOP_SCOPE,
					items: [
						form({
							id: "form-br",
							title: "Booking Request",
							systemKey: "booking_request",
							status: "published",
						}),
					],
				}),
			],
		});

		await screen.findByText("Booking Request");
		// A RouterLink-backed control with an href, not a button - see Forms.jsx's own "Edit intake
		// fields" action - so its accessible role is "link", the same as "Responses" below.
		expect(screen.getByRole("link", { name: "Edit intake fields" })).toHaveAttribute(
			"href",
			"/forms/form-br/booking-fields",
		);
		expect(screen.queryByRole("link", { name: "Responses" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Turn on link" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Duplicate" })).not.toBeInTheDocument();
		// A system form is never deletable either (see the `!form.systemKey` guard).
		expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
	});
});

describe("publishing and archiving", () => {
	it("publishes a draft form and refetches the list", async () => {
		const user = userEvent.setup();
		const publishMock = {
			request: { query: FormService.PUBLISH_FORM, variables: { formId: "form-1" } },
			result: { data: { publishForm: form({ status: "published" }) } },
		};
		renderPage({
			mocks: [
				formsMock({ scope: SHOP_SCOPE, items: [form({ status: "draft" })] }),
				publishMock,
				formsMock({ scope: SHOP_SCOPE, items: [form({ status: "published" })] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Publish" }));

		// "Published" also names one of the always-present status filter tabs above the list (see
		// Forms.jsx's formsFilterBar) - scoped to the row's own status Chip to avoid matching that.
		expect(
			await screen.findByText("Published", { selector: ".MuiChip-label" }),
		).toBeInTheDocument();
	});

	it("archives a published form and refetches the list", async () => {
		const user = userEvent.setup();
		const archiveMock = {
			request: { query: FormService.ARCHIVE_FORM, variables: { formId: "form-1" } },
			result: { data: { archiveForm: form({ status: "archived" }) } },
		};
		renderPage({
			mocks: [
				formsMock({ scope: SHOP_SCOPE, items: [form({ status: "published" })] }),
				archiveMock,
				formsMock({ scope: SHOP_SCOPE, items: [form({ status: "archived" })] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Archive" }));

		// Same filter-tab-vs-status-Chip ambiguity as the publish test above.
		expect(
			await screen.findByText("Archived", { selector: ".MuiChip-label" }),
		).toBeInTheDocument();
	});

	it("alerts the server's error message when publishing fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: { query: FormService.PUBLISH_FORM, variables: { formId: "form-1" } },
			error: new Error("Could not publish that form."),
		};
		const { setAlert } = renderPage({
			mocks: [formsMock({ scope: SHOP_SCOPE, items: [form({ status: "draft" })] }), failingMock],
		});

		await userEvent.setup().click(await screen.findByRole("button", { name: "Publish" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not publish that form.",
				}),
			),
		);
	});
});

describe("guest access toggle and copy link", () => {
	it("turns the link on, copies it to the clipboard, and shows a combined success message", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

		const toggleMock = {
			request: {
				query: FormService.SET_FORM_GUEST_ACCESS,
				variables: { formId: "form-1", allow: true },
			},
			result: {
				data: {
					setFormGuestAccess: form({ allowGuestSubmissions: true, publicToken: "tok-abc" }),
				},
			},
		};
		const { setAlert } = renderPage({
			mocks: [
				formsMock({ scope: SHOP_SCOPE, items: [form({ allowGuestSubmissions: false })] }),
				toggleMock,
				formsMock({ scope: SHOP_SCOPE, items: [form({ allowGuestSubmissions: true, publicToken: "tok-abc" })] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Turn on link" }));

		await waitFor(() =>
			expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/form/tok-abc`),
		);
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: "success",
				message: "Public link turned on and copied to your clipboard.",
			}),
		);
	});

	it("turns the link off without copying anything", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

		const toggleMock = {
			request: {
				query: FormService.SET_FORM_GUEST_ACCESS,
				variables: { formId: "form-1", allow: false },
			},
			result: { data: { setFormGuestAccess: form({ allowGuestSubmissions: false, publicToken: null }) } },
		};
		renderPage({
			mocks: [
				formsMock({ scope: SHOP_SCOPE, items: [form({ allowGuestSubmissions: true, publicToken: "tok-abc" })] }),
				toggleMock,
				formsMock({ scope: SHOP_SCOPE, items: [form({ allowGuestSubmissions: false, publicToken: null })] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Turn off link" }));

		await screen.findByRole("button", { name: "Turn on link" });
		expect(writeText).not.toHaveBeenCalled();
	});

	it("copies the existing link via Copy link", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

		const { setAlert } = renderPage({
			mocks: [
				formsMock({ scope: SHOP_SCOPE, items: [form({ allowGuestSubmissions: true, publicToken: "tok-xyz" })] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Copy link" }));

		expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/form/tok-xyz`);
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: "success",
				message: "Public link copied to your clipboard.",
			}),
		);
	});
});

describe("duplicating a form", () => {
	it("sends createForm with the source fields (keys dropped) and navigates to the new form", async () => {
		const user = userEvent.setup();
		const source = form({
			title: "Consent Form",
			fields: [
				formField({ key: "q1", type: "short_text", label: "Any allergies?", helpText: null, required: true, options: [] }),
			],
		});
		const createMock = {
			request: {
				query: FormService.CREATE_FORM,
				variables: {
					input: {
						shopId: "shop-1",
						title: "Consent Form (Copy)",
						description: "",
						fields: [
							{ type: "short_text", label: "Any allergies?", helpText: "", required: true, options: [] },
						],
					},
				},
			},
			result: { data: { createForm: form({ id: "form-copy", title: "Consent Form (Copy)" }) } },
		};
		renderPage({
			mocks: [
				formsMock({ scope: SHOP_SCOPE, items: [source] }),
				createMock,
				formsMock({ scope: SHOP_SCOPE, items: [source, form({ id: "form-copy", title: "Consent Form (Copy)" })] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Duplicate" }));

		// Reaching the refetched list (rather than an Apollo "no matching mock" error) IS the
		// assertion that the duplicate's input matched byte-for-byte, keys dropped.
		expect(await screen.findByText("Consent Form (Copy)")).toBeInTheDocument();
	});

	it("alerts the server's error message when duplicating fails", async () => {
		const user = userEvent.setup();
		const source = form();
		const failingMock = {
			request: {
				query: FormService.CREATE_FORM,
				variables: {
					input: {
						shopId: "shop-1",
						title: "Consent Form (Copy)",
						description: "",
						fields: [
							{ type: "short_text", label: "Any allergies?", helpText: "", required: true, options: [] },
						],
					},
				},
			},
			error: new Error("Could not duplicate that form."),
		};
		const { setAlert } = renderPage({
			mocks: [formsMock({ scope: SHOP_SCOPE, items: [source] }), failingMock],
		});

		await user.click(await screen.findByRole("button", { name: "Duplicate" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not duplicate that form.",
				}),
			),
		);
	});
});

describe("deleting a form", () => {
	it("does nothing when the confirmation is declined", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		const user = userEvent.setup();
		renderPage({ mocks: [formsMock({ scope: SHOP_SCOPE, items: [form()] })] });

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(confirmSpy).toHaveBeenCalledWith('Delete "Consent Form"? This can\'t be undone.');
		expect(screen.getByText("Consent Form")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});

	it("deletes via DELETE_FORM and refetches when confirmed", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const user = userEvent.setup();
		const deleteMock = {
			request: { query: FormService.DELETE_FORM, variables: { formId: "form-1" } },
			result: { data: { deleteForm: true } },
		};
		renderPage({
			mocks: [
				formsMock({ scope: SHOP_SCOPE, items: [form()] }),
				deleteMock,
				formsMock({ scope: SHOP_SCOPE, items: [] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(await screen.findByText("No forms yet.")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});
});

describe("status filtering", () => {
	it("refetches with the selected status and resets to the first page", async () => {
		const user = userEvent.setup();
		renderPage({
			mocks: [
				formsMock({ scope: SHOP_SCOPE, status: null, items: [form({ title: "All forms view" })] }),
				formsMock({
					scope: SHOP_SCOPE,
					status: "published",
					items: [form({ id: "form-2", title: "Published only", status: "published" })],
				}),
			],
		});

		await screen.findByText("All forms view");
		await user.click(screen.getByRole("button", { name: "Published" }));

		expect(await screen.findByText("Published only")).toBeInTheDocument();
		expect(screen.queryByText("All forms view")).not.toBeInTheDocument();
	});
});

describe("scope by caller", () => {
	it("queries getForms by shopId for a shop admin with a shop", async () => {
		renderPage({
			user: SHOP_ADMIN,
			mocks: [formsMock({ scope: SHOP_SCOPE, items: [form({ title: "Shop-scoped form" })] })],
		});

		expect(await screen.findByText("Shop-scoped form")).toBeInTheDocument();
	});

	it("queries getForms by artistUserId for an independent artist", async () => {
		renderPage({
			user: INDEPENDENT_ARTIST,
			mocks: [
				formsMock({
					scope: ARTIST_SCOPE,
					items: [form({ shopId: null, artistUserId: "artist-1", title: "Artist-scoped form" })],
				}),
			],
		});

		expect(await screen.findByText("Artist-scoped form")).toBeInTheDocument();
	});
});

describe("pagination", () => {
	it("hides Previous/Next but still shows the count when everything fits on one page", async () => {
		renderPage({
			mocks: [
				formsMock({
					scope: SHOP_SCOPE,
					items: [form()],
					pageInfoOverrides: { totalCount: 1, hasMore: false },
				}),
			],
		});

		await screen.findByText("Consent Form");
		expect(screen.getByText("1 form")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
	});

	it("advances the offset on Next and requests the next page", async () => {
		const user = userEvent.setup();
		renderPage({
			mocks: [
				formsMock({
					scope: SHOP_SCOPE,
					items: [form()],
					pageInfoOverrides: { totalCount: 30, hasMore: true },
				}),
				formsMock({
					scope: SHOP_SCOPE,
					page: { limit: 25, offset: 25 },
					items: [form({ id: "form-2", title: "Page two form" })],
					pageInfoOverrides: { totalCount: 30, hasMore: false, offset: 25 },
				}),
			],
		});

		await screen.findByText("Consent Form");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(await screen.findByText("Page two form")).toBeInTheDocument();
		expect(screen.queryByText("Consent Form")).not.toBeInTheDocument();
	});
});
