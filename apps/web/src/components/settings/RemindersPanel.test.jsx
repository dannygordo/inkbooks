// RemindersPanel.jsx tests. Two conversions are the load-bearing logic here, per the component's
// own header comment: offsets are EDITED in a human unit (minutes/hours/days) but stored/sent as
// minutes (minutesToUnit/unitToMinutes), and there is exactly ONE shared InkBooks texting number -
// not one per artist - so there is nothing to "connect", only channels to turn on. Most tests below
// are organised around the unit conversion at the read/write boundary and the component's own
// early-return null states (loading, no settings yet).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import RemindersPanel from "./RemindersPanel";
import { AuthContext } from "../../context/auth";
import ReminderService from "../../services/ReminderService";

// GET_SETTINGS and UPDATE_SETTINGS are both exported directly off ReminderService (see
// ReminderService.test.js's own header note), so every mock below uses the real documents rather
// than a hand-written reconstruction.
function settingsMock(settings) {
	return {
		request: { query: ReminderService.GET_SETTINGS, variables: {} },
		result: { data: { getReminderSettings: settings } },
	};
}

function reminderSettings(overrides = {}) {
	return {
		__typename: "ReminderSettings",
		emailEnabled: true,
		smsEnabled: false,
		rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true }],
		emailSubjectTemplate: "",
		emailBodyTemplate: "",
		smsTemplate: "",
		...overrides,
	};
}

function renderPanel({ mocks = [], setAlert = vi.fn() } = {}) {
	const utils = render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ setAlert }}>
				<RemindersPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { ...utils, setAlert };
}

describe("before there is anything to show", () => {
	it("renders nothing while the initial fetch is in flight", () => {
		const { container } = renderPanel({ mocks: [settingsMock(reminderSettings())] });

		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing if the server has no settings row for this caller", async () => {
		const { container } = renderPanel({ mocks: [settingsMock(null)] });

		// Not "loading forever" - the query itself resolves, just with no row. `!settings` is a
		// second, independent early return from the loading guard, and both must produce the same
		// nothing-on-screen result.
		await waitFor(() => expect(container).toBeEmptyDOMElement());
	});
});

describe("once settings have loaded", () => {
	it("shows the heading and channel switches in their hydrated on/off state", async () => {
		renderPanel({
			mocks: [settingsMock(reminderSettings({ emailEnabled: true, smsEnabled: false }))],
		});

		expect(await screen.findByRole("heading", { name: "Reminders" })).toBeInTheDocument();
		// MUI's Switch renders its underlying <input> with role="switch" (confirmed against this
		// test's own printed accessible-roles dump), not "checkbox" - matching this codebase's
		// other MUI Switch tests (see AutoResponsesPanel.test.jsx).
		// The heading commits on Apollo's data-arrival render, but MUI's Switch commits its
		// `checked` prop to the underlying <input> a tick later (its own internal re-render) - an
		// unawaited getByRole right after the heading could observe the input before that commit.
		// findByRole (awaited) settles on the first one; by then the second has settled too.
		expect(await screen.findByRole("switch", { name: "Email reminders" })).toBeChecked();
		expect(screen.getByRole("switch", { name: "Text reminders" })).not.toBeChecked();
	});

	it("explains the shared-number trade-off for text reminders", async () => {
		renderPanel({ mocks: [settingsMock(reminderSettings())] });

		expect(
			await screen.findByText(/not a number registered to you individually/),
		).toBeInTheDocument();
	});

	it("hydrates a day-long offset from minutes as a whole number of days", async () => {
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true }],
					}),
				),
			],
		});

		expect(await screen.findByLabelText("How long before")).toHaveValue(1);
		// MUI's TextField select renders as a combobox, like IBSelect - see IBSelect.test.jsx's own
		// getByRole("combobox")/getByRole("option") pattern.
		expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent("days");
	});

	it("hydrates an hour-long offset as hours, not as 60 minutes", async () => {
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 120, enabled: true }],
					}),
				),
			],
		});

		expect(await screen.findByLabelText("How long before")).toHaveValue(2);
		expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent("hours");
	});

	it("hydrates an offset that isn't a whole hour or day as raw minutes", async () => {
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 45, enabled: true }],
					}),
				),
			],
		});

		expect(await screen.findByLabelText("How long before")).toHaveValue(45);
		expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent("minutes");
	});

	it("renders one row per rule, each independently enabled", async () => {
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [
							{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true },
							{ __typename: "ReminderRule", id: "rule-2", offsetMinutes: 60, enabled: false },
						],
					}),
				),
			],
		});

		const valueFields = await screen.findAllByLabelText("How long before");
		expect(valueFields).toHaveLength(2);
		// The per-rule enable Switch has no FormControlLabel/text of its own (unlike the two channel
		// switches above it), so it's picked out by its row rather than by accessible name.
		const ruleSwitches = screen
			.getAllByRole("switch")
			.filter((el) => el.closest(".remindersRuleRow"));
		expect(ruleSwitches).toHaveLength(2);
		expect(ruleSwitches[0]).toBeChecked();
		expect(ruleSwitches[1]).not.toBeChecked();
	});

	it("puts a min of 1 on the offset field, so a rule can't be set to zero or negative", async () => {
		renderPanel({ mocks: [settingsMock(reminderSettings())] });

		expect(await screen.findByLabelText("How long before")).toHaveAttribute("min", "1");
	});

	it("pre-fills the message templates from the server, or leaves them blank when unset", async () => {
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						emailSubjectTemplate: "Heads up!",
						emailBodyTemplate: "See you soon.",
						smsTemplate: "",
					}),
				),
			],
		});

		expect(await screen.findByLabelText("Email subject")).toHaveValue("Heads up!");
		expect(screen.getByLabelText("Email body")).toHaveValue("See you soon.");
		expect(screen.getByLabelText("Text message")).toHaveValue("");
	});
});

describe("editing rules", () => {
	it("adds a new rule defaulting to 24 hours, enabled", async () => {
		const user = userEvent.setup();
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true }],
					}),
				),
			],
		});

		await screen.findAllByLabelText("How long before");
		await user.click(screen.getByRole("button", { name: "+ Add a reminder" }));

		const valueFields = screen.getAllByLabelText("How long before");
		expect(valueFields).toHaveLength(2);
		expect(valueFields[1]).toHaveValue(24);
		const unitFields = screen.getAllByRole("combobox", { name: "Unit" });
		expect(unitFields[1]).toHaveTextContent("hours");
	});

	it("removes a rule when its delete button is clicked", async () => {
		const user = userEvent.setup();
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [
							{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true },
							{ __typename: "ReminderRule", id: "rule-2", offsetMinutes: 60, enabled: true },
						],
					}),
				),
			],
		});

		const removeButtons = await screen.findAllByRole("button", { name: "Remove reminder" });
		expect(removeButtons).toHaveLength(2);
		await user.click(removeButtons[0]);

		expect(screen.getAllByLabelText("How long before")).toHaveLength(1);
	});

	it("lets the value and unit of an existing rule be changed", async () => {
		const user = userEvent.setup();
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 120, enabled: true }],
					}),
				),
			],
		});

		const valueField = await screen.findByLabelText("How long before");
		expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent("hours");
		await user.clear(valueField);
		await user.type(valueField, "3");
		expect(valueField).toHaveValue(3);

		await user.click(screen.getByRole("combobox", { name: "Unit" }));
		await user.click(await screen.findByRole("option", { name: "days" }));
		expect(screen.getByRole("combobox", { name: "Unit" })).toHaveTextContent("days");
	});
});

describe("saving", () => {
	it("converts each rule's value/unit back to minutes and sends trimmed templates", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ReminderService.UPDATE_SETTINGS,
				variables: {
					emailEnabled: true,
					smsEnabled: true,
					rules: [{ offsetMinutes: 120, enabled: true }],
					emailSubjectTemplate: "Reminder",
					emailBodyTemplate: null,
					smsTemplate: null,
				},
			},
			result: {
				data: {
					updateReminderSettings: reminderSettings({
						emailEnabled: true,
						smsEnabled: true,
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 120, enabled: true }],
						emailSubjectTemplate: "Reminder",
					}),
				},
			},
		};
		const { setAlert } = renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						emailEnabled: true,
						smsEnabled: false,
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 60, enabled: true }],
					}),
				),
				updateMock,
			],
		});

		await user.click(await screen.findByRole("switch", { name: "Text reminders" }));

		const valueField = screen.getByLabelText("How long before");
		await user.clear(valueField);
		await user.type(valueField, "2");

		// emailSubjectTemplate typed with surrounding whitespace - handleSave trims it before
		// sending, and reaching the mock (rather than an Apollo "no matching mock" error) IS the
		// assertion. emailBodyTemplate/smsTemplate are left blank, which must go out as null (the
		// server's own default), not as an empty string.
		await user.type(screen.getByLabelText("Email subject"), "  Reminder  ");

		await user.click(screen.getByRole("button", { name: "Save Reminder Settings" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Reminder settings saved.",
				}),
			),
		);
	});

	it("sends an empty rules array when every rule has been removed", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ReminderService.UPDATE_SETTINGS,
				variables: {
					emailEnabled: true,
					smsEnabled: false,
					rules: [],
					emailSubjectTemplate: null,
					emailBodyTemplate: null,
					smsTemplate: null,
				},
			},
			result: {
				data: { updateReminderSettings: reminderSettings({ rules: [] }) },
			},
		};
		const { setAlert } = renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true }],
					}),
				),
				updateMock,
			],
		});

		await user.click(await screen.findByRole("button", { name: "Remove reminder" }));
		await user.click(screen.getByRole("button", { name: "Save Reminder Settings" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success" }),
			),
		);
	});

	it("shows Saving... and disables the form's controls while the mutation is in flight", async () => {
		const user = userEvent.setup();
		const pendingMock = {
			request: {
				query: ReminderService.UPDATE_SETTINGS,
				variables: {
					emailEnabled: true,
					smsEnabled: false,
					rules: [{ offsetMinutes: 1440, enabled: true }],
					emailSubjectTemplate: null,
					emailBodyTemplate: null,
					smsTemplate: null,
				},
			},
			delay: 60 * 1000,
			result: { data: { updateReminderSettings: null } },
		};
		renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true }],
					}),
				),
				pendingMock,
			],
		});

		await screen.findByLabelText("How long before");
		await user.click(screen.getByRole("button", { name: "Save Reminder Settings" }));

		expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
		expect(screen.getByRole("switch", { name: "Email reminders" })).toBeDisabled();
		expect(screen.getByLabelText("How long before")).toBeDisabled();
	});

	it("alerts the server's error message when saving fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: ReminderService.UPDATE_SETTINGS,
				variables: {
					emailEnabled: true,
					smsEnabled: false,
					rules: [{ offsetMinutes: 1440, enabled: true }],
					emailSubjectTemplate: null,
					emailBodyTemplate: null,
					smsTemplate: null,
				},
			},
			error: new Error("Could not save reminder settings."),
		};
		const { setAlert } = renderPanel({
			mocks: [
				settingsMock(
					reminderSettings({
						rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true }],
					}),
				),
				failingMock,
			],
		});

		await screen.findByLabelText("How long before");
		await user.click(screen.getByRole("button", { name: "Save Reminder Settings" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not save reminder settings.",
				}),
			),
		);
	});
});
