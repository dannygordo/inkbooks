// IBImagesListOptions.jsx tests. The three-dot menu overlay on each image: by default, Delete
// permanently removes the underlying Firebase Storage file (IBDeleteFile) and then tells the
// caller to drop it from its own list (updateCallback) - correct for a project's own image lists,
// where that file exists only for the project. A caller can override that entirely with `onDelete`
// (the client-dashboard shared-images panel does this, since the same URL is also shown in chat
// history and must not be deleted from storage - see the component's own comment).
//
// Explicit React import - see the matching note in context/auth.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Star } from "@mui/icons-material";
import IBImagesListOptions from "./IBImagesListOptions";
import { AuthContext } from "../../context/auth";
import IBDeleteFile from "../../firebase/IBDeleteFile";
import { ALERT_CONSTANTS, AUTH_SETTINGS_CONSTANTS } from "../../constants";

vi.mock("../../firebase/IBDeleteFile", () => ({
	default: vi.fn(),
}));

const IMG = { url: "https://storage.example.com/img1.png" };

function renderOptions(props = {}, { setAlert = vi.fn() } = {}) {
	render(
		<AuthContext.Provider value={{ setAlert }}>
			<IBImagesListOptions img={IMG} imageType="referenceImages" {...props} />
		</AuthContext.Provider>,
	);
	return { setAlert };
}

async function openMenu(user) {
	await user.click(screen.getByRole("button", { name: "Options" }));
}

describe("IBImagesListOptions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows a Delete item by default, using the given deleteLabel when provided", async () => {
		const user = userEvent.setup();
		renderOptions({ updateCallback: vi.fn(), deleteLabel: "Remove" });

		await openMenu(user);

		expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument();
	});

	it("renders extraActions above Delete and calls their onClick with the image", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		renderOptions({
			updateCallback: vi.fn(),
			extraActions: [{ label: "Assign to Project", icon: <Star />, onClick }],
		});

		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Assign to Project" }));

		expect(onClick).toHaveBeenCalledWith(IMG);
	});

	it("default delete flow: deletes the storage file, then runs updateCallback, then alerts success", async () => {
		const user = userEvent.setup();
		IBDeleteFile.mockResolvedValue();
		const updateCallback = vi.fn();
		const { setAlert } = renderOptions({ updateCallback });

		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));

		await waitFor(() => expect(updateCallback).toHaveBeenCalledWith(IMG, "referenceImages"));
		expect(IBDeleteFile).toHaveBeenCalledWith(IMG.url);
		expect(setAlert).toHaveBeenLastCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: AUTH_SETTINGS_CONSTANTS.RESPONSE_MESSAGES.RECORD_UPDATE_SUCCESS,
			}),
		);
	});

	it("default delete flow: a storage delete failure is still followed by updateCallback and a final success alert", async () => {
		const user = userEvent.setup();
		IBDeleteFile.mockRejectedValue(new Error("storage delete failed"));
		const updateCallback = vi.fn();
		const { setAlert } = renderOptions({ updateCallback });

		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));

		await waitFor(() => expect(updateCallback).toHaveBeenCalledWith(IMG, "referenceImages"));
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ severity: ALERT_CONSTANTS.SEVERITY.ERROR, message: "storage delete failed" }),
		);
		// The final unconditional success alert still fires after the caught error - see the
		// component's own handleDelete, which has no early return on this path.
		expect(setAlert).toHaveBeenLastCalledWith(
			expect.objectContaining({ severity: ALERT_CONSTANTS.SEVERITY.SUCCESS }),
		);
	});

	it("uses the provided onDelete instead of IBDeleteFile/updateCallback when given", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn().mockResolvedValue();
		const updateCallback = vi.fn();
		const { setAlert } = renderOptions({ onDelete, updateCallback });

		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));

		await waitFor(() => expect(onDelete).toHaveBeenCalledWith(IMG));
		expect(IBDeleteFile).not.toHaveBeenCalled();
		expect(updateCallback).not.toHaveBeenCalled();
		expect(setAlert).toHaveBeenCalledTimes(1);
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ severity: ALERT_CONSTANTS.SEVERITY.SUCCESS }),
		);
	});

	it("a failing onDelete alerts the error and stops - it does not also fall through to a success alert", async () => {
		const user = userEvent.setup();
		const onDelete = vi.fn().mockRejectedValue(new Error("cannot unassign shared image"));
		const updateCallback = vi.fn();
		const { setAlert } = renderOptions({ onDelete, updateCallback });

		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: ALERT_CONSTANTS.SEVERITY.ERROR, message: "cannot unassign shared image" }),
			),
		);
		expect(setAlert).toHaveBeenCalledTimes(1);
		expect(updateCallback).not.toHaveBeenCalled();
		expect(IBDeleteFile).not.toHaveBeenCalled();
	});
});
