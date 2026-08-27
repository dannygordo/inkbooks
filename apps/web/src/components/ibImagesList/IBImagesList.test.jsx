// IBImagesList.jsx tests. IBImagesListOptions and IBImageTagEditor are mocked out here - each has
// its own dedicated test file - as is yet-another-react-lightbox, a heavy portal-based external
// library whose own internals aren't this component's responsibility (see the component's own
// comment on why it replaced simple-react-lightbox). What belongs to THIS file is: laying out one
// tile per image with the right thumbnail/uploader/"time ago" info, wiring each tile's overlays
// with the right props, the optional per-image badge, and driving the lightbox's open/index state
// from a thumbnail click.
//
// Explicit React import - see the matching note in context/auth.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import IBImagesList from "./IBImagesList";
import { APP_SETTINGS_CONSTANTS } from "../../constants";

const { optionsSpy, tagEditorSpy, lightboxSpy } = vi.hoisted(() => ({
	optionsSpy: vi.fn(),
	tagEditorSpy: vi.fn(),
	lightboxSpy: vi.fn(),
}));

vi.mock("./IBImagesListOptions", () => ({
	default: (props) => {
		optionsSpy(props);
		return <div data-testid={`options-${props.img.url}`} />;
	},
}));

vi.mock("./IBImageTagEditor", () => ({
	default: (props) => {
		tagEditorSpy(props);
		return (
			<div data-testid={`tag-editor-${props.img.url}`}>
				<button onClick={() => props.onTagsUpdate(props.img, ["new-tag"])}>add-tag</button>
			</div>
		);
	},
}));

vi.mock("yet-another-react-lightbox", () => ({
	default: (props) => {
		lightboxSpy(props);
		if (!props.open) return null;
		return (
			<div data-testid="lightbox" data-index={props.index}>
				<button onClick={props.close}>close-lightbox</button>
			</div>
		);
	},
}));
vi.mock("yet-another-react-lightbox/styles.css", () => ({}));

function makeImage(overrides = {}) {
	return {
		url: "https://storage.example.com/img1.png",
		title: "Half sleeve reference",
		createdAt: moment().subtract(3, "hours").toISOString(),
		userInfo: { firstName: "Jon", lastName: "Snow", avatar: "avatar.png" },
		...overrides,
	};
}

describe("IBImagesList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders one tile per image, with its thumbnail (real Firebase URL, unmodified) and 'time ago' pill", () => {
		const images = [makeImage({ url: "img1.png" }), makeImage({ url: "img2.png" })];
		render(<IBImagesList imageData={images} updateCallback={vi.fn()} imageType="referenceImages" />);

		const thumbnails = screen.getAllByRole("img");
		expect(thumbnails).toHaveLength(2);
		// No CDN resize params appended - see the component's own comment on why doing that broke
		// every real Firebase Storage URL by corrupting its ?alt=media&token=... query string.
		expect(thumbnails.map((img) => img.getAttribute("src"))).toEqual(["img1.png", "img2.png"]);
		expect(screen.getAllByText("3 hours ago")).toHaveLength(2);
	});

	it("shows the uploader's name in the avatar tooltip, and falls back to 'Unknown uploader' with no userInfo", () => {
		const images = [
			makeImage({ url: "img1.png", userInfo: { firstName: "Jon", lastName: "Snow", avatar: "avatar.png" } }),
			makeImage({ url: "img2.png", userInfo: null }),
		];
		render(<IBImagesList imageData={images} updateCallback={vi.fn()} imageType="referenceImages" />);

		const avatars = document.querySelectorAll(".MuiAvatar-root");
		expect(avatars).toHaveLength(2);
		// .MuiAvatar-root is the outer wrapper, not the <img> itself - MUI renders
		// <span class="MuiAvatar-root"><img class="MuiAvatar-img" src=... /></span>, so the src
		// attribute lives one level down.
		expect(avatars[0].querySelector("img")).toHaveAttribute("src", "avatar.png");
		expect(avatars[1].querySelector("img")).toHaveAttribute("src", APP_SETTINGS_CONSTANTS.NO_IMAGE_URL);
	});

	it("passes updateCallback/imageType/onDelete/deleteLabel/extraActions through to IBImagesListOptions per image", () => {
		const updateCallback = vi.fn();
		const onDelete = vi.fn();
		const extraActions = [{ label: "Assign", icon: null, onClick: vi.fn() }];
		const images = [makeImage({ url: "img1.png" })];
		render(
			<IBImagesList
				imageData={images}
				updateCallback={updateCallback}
				imageType="designImages"
				onDelete={onDelete}
				deleteLabel="Remove"
				extraActions={extraActions}
			/>,
		);

		expect(optionsSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				img: images[0],
				updateCallback,
				imageType: "designImages",
				onDelete,
				deleteLabel: "Remove",
				extraActions,
			}),
		);
	});

	it("does not mount a tag editor when onTagsUpdate is not provided", () => {
		render(<IBImagesList imageData={[makeImage({ url: "img1.png" })]} updateCallback={vi.fn()} imageType="referenceImages" />);

		expect(tagEditorSpy).not.toHaveBeenCalled();
	});

	it("mounts a tag editor per image when onTagsUpdate is provided, wired to include imageType", async () => {
		const user = userEvent.setup();
		const onTagsUpdate = vi.fn();
		const img = makeImage({ url: "img1.png" });
		render(<IBImagesList imageData={[img]} updateCallback={vi.fn()} imageType="referenceImages" onTagsUpdate={onTagsUpdate} />);

		expect(tagEditorSpy).toHaveBeenCalledWith(expect.objectContaining({ img }));

		await user.click(screen.getByRole("button", { name: "add-tag" }));

		expect(onTagsUpdate).toHaveBeenCalledWith(img, ["new-tag"], "referenceImages");
	});

	it("renders a renderBadge overlay only for images where it returns something truthy", () => {
		const images = [makeImage({ url: "img1.png" }), makeImage({ url: "img2.png" })];
		const renderBadge = (item) => (item.url === "img1.png" ? "Added to References" : null);
		render(<IBImagesList imageData={images} updateCallback={vi.fn()} imageType="referenceImages" renderBadge={renderBadge} />);

		expect(screen.getByText("Added to References")).toBeInTheDocument();
	});

	it("renders no badge overlay at all when renderBadge is not provided", () => {
		render(<IBImagesList imageData={[makeImage({ url: "img1.png" })]} updateCallback={vi.fn()} imageType="referenceImages" />);

		expect(screen.queryByText("Added to References")).not.toBeInTheDocument();
	});

	it("opens the lightbox at the clicked image's index, with every image as a slide", async () => {
		const user = userEvent.setup();
		const images = [makeImage({ url: "img1.png" }), makeImage({ url: "img2.png" }), makeImage({ url: "img3.png" })];
		render(<IBImagesList imageData={images} updateCallback={vi.fn()} imageType="referenceImages" />);

		expect(lightboxSpy).toHaveBeenCalledWith(expect.objectContaining({ open: false }));

		const thumbnails = screen.getAllByRole("img");
		await user.click(thumbnails[1]);

		expect(screen.getByTestId("lightbox")).toHaveAttribute("data-index", "1");
		const lastCall = lightboxSpy.mock.calls[lightboxSpy.mock.calls.length - 1][0];
		expect(lastCall.open).toBe(true);
		expect(lastCall.slides).toEqual([
			{ src: "img1.png", alt: images[0].title },
			{ src: "img2.png", alt: images[1].title },
			{ src: "img3.png", alt: images[2].title },
		]);
	});

	it("closes the lightbox via its own close callback", async () => {
		const user = userEvent.setup();
		render(<IBImagesList imageData={[makeImage({ url: "img1.png" })]} updateCallback={vi.fn()} imageType="referenceImages" />);

		await user.click(screen.getByRole("img"));
		expect(screen.getByTestId("lightbox")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "close-lightbox" }));

		expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
	});
});
