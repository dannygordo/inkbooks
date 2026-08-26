// CropEasy.jsx tests. AccountPanel.test.jsx's own header comment documents why the crop flow
// isn't exercised through AccountPanel itself ("it needs an actual File plus react-easy-crop's
// canvas cropping, which is out of scope for a component test") - this is that component's own
// test file instead.
//
// react-easy-crop's Cropper is mocked to a trivial stub exposing its callback props as buttons -
// it's a third-party drag/pinch-driven widget with its own release tests, and driving a real
// pointer-based crop gesture through jsdom (which also lacks getBoundingClientRect layout data)
// would test react-easy-crop's own internals rather than CropEasy's wiring of it. The stub lets a
// test fire onCropComplete/onZoomChange/onRotationChange exactly as the real widget would, so
// what's actually under test - state flowing from those callbacks into the Zoom/Rotation labels
// and into the eventual getCroppedImg call - is exercised for real.
//
// utils/cropImage's getCroppedImg is mocked too: it draws through an actual <canvas>
// getContext('2d'), which jsdom does not implement without the optional `canvas` native package
// (not installed here) - calling the real function in this environment degrades to a "not
// implemented" jsdom console error and a null context, not a real crop. Mocking it lets success
// and failure both be tested deterministically, matching how this suite treats other
// environment-only-emulable browser APIs.
//
// Explicit React import - see the note in DaySchedule.test.jsx/EntityWizard.test.jsx: under
// Vitest, @vitejs/plugin-react compiles test-file JSX with the classic runtime, so a component
// rendered by a test needs React in scope explicitly.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CropEasy from "./CropEasy";
import { AuthContext } from "../../context/auth";
import getCroppedImg from "./utils/cropImage";

vi.mock("./utils/cropImage", () => ({ default: vi.fn() }));

vi.mock("react-easy-crop", () => ({
	default: ({ image, crop, zoom, rotation, onZoomChange, onRotationChange, onCropChange, onCropComplete }) => (
		<div data-testid="cropper-stub">
			<span data-testid="cropper-image">{image}</span>
			<span data-testid="cropper-crop">{JSON.stringify(crop)}</span>
			<span data-testid="cropper-zoom">{zoom}</span>
			<span data-testid="cropper-rotation">{rotation}</span>
			<button onClick={() => onCropChange({ x: 5, y: 8 })}>stub-crop-move</button>
			<button onClick={() => onZoomChange(2)}>stub-zoom-2</button>
			<button onClick={() => onRotationChange(90)}>stub-rotate-90</button>
			<button
				onClick={() =>
					onCropComplete(
						{ x: 0, y: 0, width: 50, height: 50 },
						{ x: 10, y: 20, width: 200, height: 200 },
					)
				}
			>
				stub-crop-complete
			</button>
		</div>
	),
}));

const PHOTO_URL = "blob:http://localhost/original-photo";

function renderCropEasy({ setAlert = vi.fn(), setLoading = vi.fn(), ...props } = {}) {
	const setOpenCrop = vi.fn();
	const setPhotoURL = vi.fn();
	const setFile = vi.fn();
	const utils = render(
		<AuthContext.Provider value={{ setAlert, setLoading }}>
			<CropEasy
				photoURL={PHOTO_URL}
				setOpenCrop={setOpenCrop}
				setPhotoURL={setPhotoURL}
				setFile={setFile}
				{...props}
			/>
		</AuthContext.Provider>,
	);
	return { ...utils, setAlert, setLoading, setOpenCrop, setPhotoURL, setFile };
}

describe("CropEasy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("initial render", () => {
		it("passes the given photo through to the cropper at zoom 1 and rotation 0", () => {
			renderCropEasy();

			expect(screen.getByTestId("cropper-image")).toHaveTextContent(PHOTO_URL);
			expect(screen.getByTestId("cropper-zoom")).toHaveTextContent("1");
			expect(screen.getByTestId("cropper-rotation")).toHaveTextContent("0");
			expect(screen.getByText("Zoom: 100%")).toBeInTheDocument();
			expect(screen.getByText("Rotation: 0°")).toBeInTheDocument();
		});

		it("renders Cancel and Crop actions", () => {
			renderCropEasy();
			expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Crop" })).toBeInTheDocument();
		});
	});

	describe("zoom and rotation", () => {
		it("updates the Zoom label and the value handed to the cropper when zoom changes", async () => {
			const user = userEvent.setup();
			renderCropEasy();

			await user.click(screen.getByRole("button", { name: "stub-zoom-2" }));

			expect(screen.getByText("Zoom: 200%")).toBeInTheDocument();
			expect(screen.getByTestId("cropper-zoom")).toHaveTextContent("2");
			expect(screen.queryByText("Zoom: 100%")).not.toBeInTheDocument();
		});

		it("updates the Rotation label and the value handed to the cropper when rotation changes", async () => {
			const user = userEvent.setup();
			renderCropEasy();

			await user.click(screen.getByRole("button", { name: "stub-rotate-90" }));

			expect(screen.getByText("Rotation: 90°")).toBeInTheDocument();
			expect(screen.getByTestId("cropper-rotation")).toHaveTextContent("90");
		});
	});

	describe("Cancel", () => {
		it("closes the dialog without cropping", async () => {
			const user = userEvent.setup();
			const { setOpenCrop } = renderCropEasy();

			await user.click(screen.getByRole("button", { name: "Cancel" }));

			expect(setOpenCrop).toHaveBeenCalledWith(false);
			expect(getCroppedImg).not.toHaveBeenCalled();
		});
	});

	describe("Crop", () => {
		it("crops with the last onCropComplete pixel area and current rotation, then applies the result and closes", async () => {
			const user = userEvent.setup();
			getCroppedImg.mockResolvedValue({ file: "the-cropped-file", url: "blob:cropped-result" });
			const { setPhotoURL, setFile, setOpenCrop, setLoading } = renderCropEasy();

			await user.click(screen.getByRole("button", { name: "stub-rotate-90" }));
			await user.click(screen.getByRole("button", { name: "stub-crop-complete" }));
			await user.click(screen.getByRole("button", { name: "Crop" }));

			expect(setLoading).toHaveBeenCalledWith(true);
			expect(getCroppedImg).toHaveBeenCalledWith(
				PHOTO_URL,
				{ x: 10, y: 20, width: 200, height: 200 },
				90,
			);
			await waitFor(() => expect(setPhotoURL).toHaveBeenCalledWith("blob:cropped-result"));
			expect(setFile).toHaveBeenCalledWith("the-cropped-file");
			expect(setOpenCrop).toHaveBeenCalledWith(false);
			await waitFor(() => expect(setLoading).toHaveBeenLastCalledWith(false));
		});

		it("crops with null pixel area and rotation 0 when nothing has been adjusted yet", async () => {
			const user = userEvent.setup();
			getCroppedImg.mockResolvedValue({ file: "f", url: "u" });
			renderCropEasy();

			await user.click(screen.getByRole("button", { name: "Crop" }));

			await waitFor(() => expect(getCroppedImg).toHaveBeenCalledWith(PHOTO_URL, null, 0));
		});

		it("shows an error alert and does not apply a result when cropping fails", async () => {
		const user = userEvent.setup();
			getCroppedImg.mockRejectedValue(new Error("Could not read the image"));
			const { setAlert, setPhotoURL, setFile, setOpenCrop, setLoading } = renderCropEasy();

			await user.click(screen.getByRole("button", { name: "Crop" }));

			await waitFor(() =>
				expect(setAlert).toHaveBeenCalledWith({
					isAlert: true,
					severity: "error",
					message: "Could not read the image",
					timeout: 5000,
					location: "modal",
				}),
			);
			expect(setPhotoURL).not.toHaveBeenCalled();
			expect(setFile).not.toHaveBeenCalled();
			expect(setOpenCrop).not.toHaveBeenCalled();
			await waitFor(() => expect(setLoading).toHaveBeenLastCalledWith(false));
		});
	});
});
