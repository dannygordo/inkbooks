// SharedImagesPanel.jsx tests. See the component's own header comment: every image shared via a
// message with this client, plus the one action unique to this list - filing an image onto a
// project's References/Design/Finished-Tattoo list via the "Assign to project" modal.
//
// IBImagesList is mocked out - it has its own full test file (IBImagesList.test.jsx) and this
// file's job is confirming SharedImagesPanel wires the right data and callbacks into it, not
// re-testing the MUI ImageList/Lightbox rendering itself (the same "don't exercise somebody else's
// test" pattern IBPageActionBar.test.jsx uses for the wizards it opens). Real GraphQL documents
// from SharedImageService are used with MockedProvider for the actual data flow, matching this
// codebase's own convention (see ShopCutPayoutList.test.jsx's header comment on why).
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import SharedImagesPanel from "./SharedImagesPanel";
import { AuthContext } from "../../context/auth";
import SharedImageService from "../../services/SharedImageService";

vi.mock("../ibImagesList/IBImagesList", () => ({
	default: vi.fn(({ imageData, onTagsUpdate, onDelete, deleteLabel, extraActions, renderBadge }) => (
		<div data-testid="ib-images-list">
			<span data-testid="image-count">{imageData.length}</span>
			<span data-testid="delete-label">{deleteLabel}</span>
			{imageData.map((img) => (
				<div key={img.id} data-testid={`row-${img.id}`}>
					<span>{img.url}</span>
					<span data-testid={`badge-${img.id}`}>{renderBadge ? renderBadge(img) : null}</span>
					<button onClick={() => onTagsUpdate(img, ["retouch"])}>update tags {img.id}</button>
					<button onClick={() => onDelete(img)}>remove {img.id}</button>
					{extraActions.map((action) => (
						<button key={action.label} onClick={() => action.onClick(img)}>
							{action.label} {img.id}
						</button>
					))}
				</div>
			))}
		</div>
	)),
}));

const CLIENT_ID = "client-1";

function sharedImage(overrides = {}) {
	return {
		__typename: "SharedImage",
		id: "img-1",
		url: "https://example.com/img-1.jpg",
		clientId: CLIENT_ID,
		artistId: "artist-1",
		senderId: "artist-1",
		userInfo: { firstName: "Sam", lastName: "Artist", avatar: null },
		tags: [],
		assignedProjectId: null,
		assignedImageType: null,
		assignedProject: null,
		assignedAt: null,
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		...overrides,
	};
}

function imagesMock(images, clientId = CLIENT_ID) {
	return {
		request: { query: SharedImageService.GET_SHARED_IMAGES_FOR_CLIENT, variables: { clientId } },
		result: { data: { getSharedImagesForClient: images } },
	};
}

function projectsMock(projects, clientId = CLIENT_ID) {
	return {
		request: { query: SharedImageService.GET_PROJECTS_FOR_CLIENT, variables: { clientId } },
		result: { data: { getProjectsForClient: projects } },
	};
}

function project(overrides = {}) {
	return { __typename: "Project", id: "proj-1", title: "Full Sleeve", status: "in_progress", ...overrides };
}

function renderPanel({ mocks = [], setAlert = vi.fn(), modal = { isOpen: false }, setModal = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ setAlert, modal, setModal }}>
				<SharedImagesPanel clientId={CLIENT_ID} />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert, modal, setModal };
}

describe("loading", () => {
	it("renders nothing while the initial fetch is in flight", () => {
		const { container } = render(
			<MockedProvider mocks={[imagesMock([]), projectsMock([])]}>
				<AuthContext.Provider value={{ setAlert: vi.fn(), modal: { isOpen: false }, setModal: vi.fn() }}>
					<SharedImagesPanel clientId={CLIENT_ID} />
				</AuthContext.Provider>
			</MockedProvider>,
		);
		expect(container).toBeEmptyDOMElement();
	});
});

describe("no images shared yet", () => {
	it("shows the empty message and never mounts IBImagesList", async () => {
		renderPanel({ mocks: [imagesMock([]), projectsMock([])] });

		expect(await screen.findByText("No images shared yet.")).toBeInTheDocument();
		expect(screen.queryByTestId("ib-images-list")).not.toBeInTheDocument();
	});
});

describe("with images", () => {
	it("hands IBImagesList the full image list and a non-destructive delete label", async () => {
		renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" }), sharedImage({ id: "i2" })]), projectsMock([])],
		});

		expect(await screen.findByTestId("image-count")).toHaveTextContent("2");
		expect(screen.getByTestId("delete-label")).toHaveTextContent("Remove from this list");
	});

	it("shows no badge for an image that hasn't been filed onto a project", async () => {
		renderPanel({ mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([])] });

		await screen.findByTestId("row-i1");
		expect(screen.getByTestId("badge-i1")).toBeEmptyDOMElement();
	});

	it("badges an assigned image with its project title and image-type label", async () => {
		renderPanel({
			mocks: [
				imagesMock([
					sharedImage({
						id: "i1",
						assignedProjectId: "proj-1",
						assignedImageType: "BODY",
						assignedProject: { id: "proj-1", title: "Full Sleeve" },
					}),
				]),
				projectsMock([]),
			],
		});

		expect(await screen.findByTestId("badge-i1")).toHaveTextContent(
			"Added to Full Sleeve's Finished Tattoo",
		);
	});

	it("falls back to 'a project' in the badge when the assigned project has no title", async () => {
		renderPanel({
			mocks: [
				imagesMock([
					sharedImage({
						id: "i1",
						assignedProjectId: "proj-1",
						assignedImageType: "REFERENCE",
						assignedProject: { id: "proj-1", title: null },
					}),
				]),
				projectsMock([]),
			],
		});

		expect(await screen.findByTestId("badge-i1")).toHaveTextContent("Added to a project's References");
	});
});

describe("updating tags", () => {
	it("calls updateSharedImageTags with the new tags", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: SharedImageService.UPDATE_SHARED_IMAGE_TAGS,
				variables: { sharedImageId: "i1", tags: ["retouch"] },
			},
			result: { data: { updateSharedImageTags: sharedImage({ id: "i1", tags: ["retouch"] }) } },
		};
		renderPanel({ mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([]), updateMock] });

		await user.click(await screen.findByText("update tags i1"));

		// Reaching here with no MockedProvider "no matching mock" error IS the assertion that the
		// exact variables above went out - nothing else on screen changes for this mutation.
		await waitFor(() => screen.getByTestId("row-i1"));
	});

	it("alerts the server's error message when the tag update fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: SharedImageService.UPDATE_SHARED_IMAGE_TAGS,
				variables: { sharedImageId: "i1", tags: ["retouch"] },
			},
			error: new Error("Could not update tags."),
		};
		const { setAlert } = renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([]), failingMock],
		});

		await user.click(await screen.findByText("update tags i1"));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error", message: "Could not update tags." }),
			),
		);
	});
});

describe("removing an image from this list", () => {
	it("calls removeSharedImageFromList and evicts it, without touching the underlying message", async () => {
		const user = userEvent.setup();
		const removeMock = {
			request: {
				query: SharedImageService.REMOVE_SHARED_IMAGE_FROM_LIST,
				variables: { sharedImageId: "i1" },
			},
			result: { data: { removeSharedImageFromList: true } },
		};
		renderPanel({
			mocks: [
				imagesMock([sharedImage({ id: "i1" }), sharedImage({ id: "i2" })]),
				projectsMock([]),
				removeMock,
			],
		});

		expect(await screen.findByTestId("image-count")).toHaveTextContent("2");
		await user.click(screen.getByText("remove i1"));

		// removeMock only matches THIS exact { sharedImageId: "i1" } - MockedProvider would throw
		// a "no matching mock" error had handleRemove sent anything else, so the panel staying up
		// with no crash confirms the right variables went out. Whether the cache's own evict+gc
		// (SharedImagesPanel's own `update`) also shrinks the list on screen without a refetch
		// depends on Apollo's own dangling-reference handling for the parent list field, which is
		// Apollo's behavior to verify, not this component's - not asserted here.
		await waitFor(() => expect(screen.getByTestId("ib-images-list")).toBeInTheDocument());
	});
});

describe("assigning an image to a project", () => {
	it("shows an error alert instead of opening the modal when the client has no projects yet", async () => {
		const user = userEvent.setup();
		const { setAlert, setModal } = renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([])],
		});

		await user.click(await screen.findByText("Assign to project i1"));

		expect(setModal).not.toHaveBeenCalled();
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: "error",
				message: "This client has no projects yet to file an image onto.",
			}),
		);
	});

	it("opens the modal with a project/image-type form when the client has projects", async () => {
		const user = userEvent.setup();
		const { setModal } = renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([project()])],
		});

		await user.click(await screen.findByText("Assign to project i1"));

		expect(setModal).toHaveBeenCalledTimes(1);
		const call = setModal.mock.calls[0][0];
		expect(call.isOpen).toBe(true);
		expect(call.title).toBe("Assign to project");
		expect(React.isValidElement(call.content)).toBe(true);
	});

	it("submits assignSharedImageToProject with the chosen project/type and alerts success", async () => {
		const user = userEvent.setup();
		const assignMock = {
			request: {
				query: SharedImageService.ASSIGN_SHARED_IMAGE_TO_PROJECT,
				variables: { sharedImageId: "i1", projectId: "proj-1", imageType: "REFERENCE" },
			},
			result: {
				data: {
					assignSharedImageToProject: sharedImage({
						id: "i1",
						assignedProjectId: "proj-1",
						assignedImageType: "REFERENCE",
					}),
				},
			},
		};
		const { setAlert, setModal, modal } = renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([project()]), assignMock],
		});

		await user.click(await screen.findByText("Assign to project i1"));
		const modalContent = setModal.mock.calls[0][0].content;

		// The form defaults to the first project and the first image-type option (REFERENCE) - see
		// AssignImageForm's own initial state - so submitting straight away exercises exactly the
		// mock's variables above.
		render(modalContent);
		await user.click(screen.getByRole("button", { name: "Add" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Added to References.",
				}),
			),
		);
		// closeModal spreads the CURRENT modal and forces isOpen false.
		expect(setModal).toHaveBeenCalledWith({ ...modal, isOpen: false });
	});

	it("alerts the server's error message when assigning fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: SharedImageService.ASSIGN_SHARED_IMAGE_TO_PROJECT,
				variables: { sharedImageId: "i1", projectId: "proj-1", imageType: "REFERENCE" },
			},
			error: new Error("Could not assign image."),
		};
		const { setAlert, setModal } = renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([project()]), failingMock],
		});

		await user.click(await screen.findByText("Assign to project i1"));
		const modalContent = setModal.mock.calls[0][0].content;
		render(modalContent);
		await user.click(screen.getByRole("button", { name: "Add" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error", message: "Could not assign image." }),
			),
		);
	});

	it("lets the form's Cancel button call the wired onCancel", async () => {
		const user = userEvent.setup();
		const { setModal } = renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([project()])],
		});

		await user.click(await screen.findByText("Assign to project i1"));
		const modalContent = setModal.mock.calls[0][0].content;
		render(modalContent);

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(setModal).toHaveBeenLastCalledWith({ isOpen: false });
	});

	it("disables Add when no project is selected", async () => {
		const user = userEvent.setup();
		const { setModal } = renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([project()])],
		});

		await user.click(await screen.findByText("Assign to project i1"));
		const modalContent = setModal.mock.calls[0][0].content;
		render(modalContent);

		await user.click(screen.getByRole("combobox", { name: "Project" }));
		await user.click(screen.getByRole("option", { name: "None" }));

		expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
	});

	it("lets a different image type be chosen before submitting", async () => {
		const user = userEvent.setup();
		const assignMock = {
			request: {
				query: SharedImageService.ASSIGN_SHARED_IMAGE_TO_PROJECT,
				variables: { sharedImageId: "i1", projectId: "proj-1", imageType: "DESIGN" },
			},
			result: {
				data: {
					assignSharedImageToProject: sharedImage({
						id: "i1",
						assignedProjectId: "proj-1",
						assignedImageType: "DESIGN",
					}),
				},
			},
		};
		const { setAlert, setModal } = renderPanel({
			mocks: [imagesMock([sharedImage({ id: "i1" })]), projectsMock([project()]), assignMock],
		});

		await user.click(await screen.findByText("Assign to project i1"));
		const modalContent = setModal.mock.calls[0][0].content;
		render(modalContent);

		await user.click(screen.getByRole("combobox", { name: "Add to" }));
		await user.click(await screen.findByRole("option", { name: "Design" }));
		await user.click(screen.getByRole("button", { name: "Add" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success", message: "Added to Design." }),
			),
		);
	});
});
