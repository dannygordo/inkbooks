// IBProgressItemProject.jsx tests. This renders exactly one in-flight upload: it kicks off
// IBUploadFileWithProgress in a mount effect, shows a live thumbnail (via URL.createObjectURL)
// with either the circular progress overlay (progress < 100) or a checkmark (progress === 100,
// which is also this component's own initial state - see its useState(100) - so a freshly
// mounted item shows a checkmark for an instant before any real progress event arrives), and on
// success reports the finished image up to the parent via setUrlList and then unmounts its own
// thumbnail. On failure it alerts the error and leaves the thumbnail exactly as it was.
//
// Explicit React import - see the matching note in context/auth.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import IBProgressItemProject from "./IBProgressItemProject";
import { AuthContext } from "../../../../context/auth";
import IBUploadFileWithProgress from "../../../../firebase/IBUploadFileWithProgress";

vi.mock("../../../../firebase/IBUploadFileWithProgress", () => ({
	default: vi.fn(),
}));

// Deterministic stand-in for bson's ObjectID - see pages/projects/Project.test.jsx's own comment
// on why the real constructor's internal shape can't be reproduced by hand for an assertion, and
// why returning a plain object from the mocked "constructor" is what makes `new ObjectID()`
// evaluate to that object.
vi.mock("bson", () => ({
	ObjectID: function () {
		return { value: "fixed-image-id" };
	},
}));

const USER = {
	id: "artist-1",
	userInfo: { firstName: "Jon", lastName: "Snow", avatar: "avatar.png" },
};

function makeProject(overrides = {}) {
	return {
		id: "project-1",
		artistId: "artist-1",
		artist: { shop: { id: "shop-1" } },
		...overrides,
	};
}

function renderItem({ file, project = makeProject(), title = "References", setUrlList = vi.fn() } = {}) {
	return render(
		<AuthContext.Provider value={{ user: USER }}>
			<IBProgressItemProject file={file} project={project} title={title} setUrlList={setUrlList} />
		</AuthContext.Provider>,
	);
}

describe("IBProgressItemProject", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// jsdom doesn't implement URL.createObjectURL at all - the component calls it
		// unconditionally on mount to preview the file being uploaded.
		URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
		vi.spyOn(window, "alert").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	it("previews the chosen file and starts the upload immediately on mount", () => {
		const file = new File(["art"], "reference.png", { type: "image/png" });
		IBUploadFileWithProgress.mockReturnValue(new Promise(() => {})); // never resolves

		renderItem({ file });

		expect(URL.createObjectURL).toHaveBeenCalledWith(file);
		expect(screen.getByAltText("gallery")).toHaveAttribute("src", "blob:mock-preview-url");
		expect(IBUploadFileWithProgress).toHaveBeenCalledTimes(1);
	});

	// progress starts at 100 (see the component's own useState(100)), so before any real progress
	// event arrives, a freshly mounted item shows the checkmark rather than a percentage.
	it("shows a checkmark, not a progress circle, before any progress event has fired", () => {
		const file = new File(["art"], "reference.png", { type: "image/png" });
		IBUploadFileWithProgress.mockReturnValue(new Promise(() => {}));

		renderItem({ file });

		expect(screen.getByTestId("CheckCircleOutlinedIcon")).toBeInTheDocument();
		expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
	});

	it("switches to the circular progress overlay once a progress event fires below 100", async () => {
		const file = new File(["art"], "reference.png", { type: "image/png" });
		IBUploadFileWithProgress.mockImplementation((_file, _path, _name, setProgress) => {
			setProgress(42);
			return new Promise(() => {});
		});

		renderItem({ file });

		await waitFor(() => expect(screen.getByText("42%")).toBeInTheDocument());
		expect(screen.queryByTestId("CheckCircleOutlinedIcon")).not.toBeInTheDocument();
	});

	it("builds the storage path from the shop id when the project's artist has a shop", async () => {
		const file = new File(["art"], "reference.png", { type: "image/png" });
		IBUploadFileWithProgress.mockResolvedValue("https://storage.example.com/uploaded.png");

		renderItem({
			file,
			project: makeProject({ id: "project-9", artistId: "artist-9", artist: { shop: { id: "shop-9" } } }),
			title: "References",
		});

		await waitFor(() => expect(IBUploadFileWithProgress).toHaveBeenCalledTimes(1));
		const [, path] = IBUploadFileWithProgress.mock.calls[0];
		expect(path).toBe("shop-9/artist-9/project-9/References");
	});

	// An independent artist legitimately has no shop at all (Artist.shopId is optional by design,
	// see the component's own comment) - falls back to the literal 'independent' path segment
	// instead of crashing on `.shop.id`.
	it("falls back to an 'independent' path segment when the artist has no shop", async () => {
		const file = new File(["art"], "reference.png", { type: "image/png" });
		IBUploadFileWithProgress.mockResolvedValue("https://storage.example.com/uploaded.png");

		renderItem({
			file,
			project: makeProject({ id: "project-9", artistId: "artist-9", artist: { shop: null } }),
			title: "References",
		});

		await waitFor(() => expect(IBUploadFileWithProgress).toHaveBeenCalledTimes(1));
		const [, path] = IBUploadFileWithProgress.mock.calls[0];
		expect(path).toBe("independent/artist-9/project-9/References");
	});

	// UtilsService.formatImagePathForFirebaseStorage trims and collapses whitespace into
	// underscores - exercised for real here (not mocked) since a multi-word title like
	// "Finished Tattoo" is a normal, real value for this path.
	it("collapses whitespace in a multi-word title into underscores via UtilsService", async () => {
		const file = new File(["art"], "photo.png", { type: "image/png" });
		IBUploadFileWithProgress.mockResolvedValue("https://storage.example.com/uploaded.png");

		renderItem({ file, title: "Finished Tattoo" });

		await waitFor(() => expect(IBUploadFileWithProgress).toHaveBeenCalledTimes(1));
		const [, path] = IBUploadFileWithProgress.mock.calls[0];
		expect(path).toBe("shop-1/artist-1/project-1/Finished_Tattoo");
	});

	it("reports the finished image to the parent and removes its own thumbnail on success", async () => {
		const file = new File(["art"], "reference.png", { type: "image/png" });
		IBUploadFileWithProgress.mockResolvedValue("https://storage.example.com/uploaded.png");
		const setUrlList = vi.fn();

		renderItem({ file, setUrlList });

		await waitFor(() => expect(setUrlList).toHaveBeenCalledTimes(1));
		// setUrlList is called with an updater function, not a plain value - matches how
		// IBProgressListProject expects to accumulate several of these into one urlList.
		const updater = setUrlList.mock.calls[0][0];
		expect(typeof updater).toBe("function");
		const result = updater([]);
		expect(result).toEqual([
			expect.objectContaining({
				id: { value: "fixed-image-id" },
				url: "https://storage.example.com/uploaded.png",
				uploadedByDisplayName: "Jon Snow",
				avatar: "avatar.png",
				userId: "artist-1",
			}),
		]);
		expect(result[0].createdAt).toEqual(expect.any(String));
		expect(result[0].updatedAt).toEqual(expect.any(String));

		// The thumbnail is only for tracking an in-flight upload - once it has succeeded and been
		// handed off to the parent, this item has nothing left to show.
		await waitFor(() => expect(screen.queryByAltText("gallery")).not.toBeInTheDocument());
	});

	it("alerts the error and leaves the thumbnail in place when the upload fails", async () => {
		const file = new File(["art"], "reference.png", { type: "image/png" });
		IBUploadFileWithProgress.mockRejectedValue(new Error("Upload failed: network error"));
		const setUrlList = vi.fn();

		renderItem({ file, setUrlList });

		await waitFor(() =>
			expect(window.alert).toHaveBeenCalledWith("Upload failed: network error"),
		);
		expect(setUrlList).not.toHaveBeenCalled();
		expect(screen.getByAltText("gallery")).toBeInTheDocument();
	});
});
