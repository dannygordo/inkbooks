import React, { useState } from "react";
import { AssignmentTurnedIn } from "@mui/icons-material";
import { Button, DialogActions, DialogContent } from "@mui/material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBImagesList from "../ibImagesList/IBImagesList";
import IBSelect from "../inputs/IBSelect";
import SharedImageService from "../../services/SharedImageService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";

// Server enum (see server/models/SharedImage.js's assignedImageType, and
// resolvers/sharedImages.js's VALID_IMAGE_TYPES) - deliberately NOT
// APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES, which is a different, lowercase, client-only-used
// set of values for Project.jsx's own internal dispatch and has never actually gone over the
// wire. "Finished Tattoo" matches the label Project.jsx already uses for bodyImages, rather than
// a literal "Body Images" nobody else in the app calls it.
const IMAGE_TYPE_OPTIONS = [
	{ value: "REFERENCE", label: "References" },
	{ value: "DESIGN", label: "Design" },
	{ value: "BODY", label: "Finished Tattoo" },
];
const IMAGE_TYPE_LABEL = IMAGE_TYPE_OPTIONS.reduce(
	(map, opt) => ({ ...map, [opt.value]: opt.label }),
	{}
);

/**
 * Every image shared via a message in this client's conversation(s) - by the client or the
 * artist - with the same tag/lightbox affordances the project image lists already have (reusing
 * IBImagesList.jsx directly), plus the one action unique to this list: filing an image onto a
 * project's References/Design/Finished-Tattoo list.
 *
 * Artist-and-shop-admin only (see server/utils/shop-membership.js's
 * canManageClientSharedImages) - mounted from ClientDashboard.jsx alongside Notes/Flags, which
 * are gated the same `!isSelf` way for the same reason: this triages what an artist DOES with a
 * client's images, not something the client themselves has a reason to see.
 *
 * "Delete" here removes the row from THIS list only - unlike the project image lists' own
 * delete, it never touches the underlying file or the original message (see
 * IBImagesListOptions.jsx's own comment on why: that file is also the image shown in the
 * client's actual chat history).
 */
const SharedImagesPanel = ({ clientId }) => {
	const { setAlert, modal, setModal } = useAuth();
	const { data, loading } = SharedImageService.getSharedImagesForClient(clientId);
	const { data: projectsData } = SharedImageService.getProjectsForClient(clientId);
	const [assignSharedImageToProject] = SharedImageService.useAssignSharedImageToProject();
	const [updateSharedImageTags] = SharedImageService.useUpdateSharedImageTags();
	const [removeSharedImageFromList] = SharedImageService.useRemoveSharedImageFromList();

	const images = data?.getSharedImagesForClient || [];
	const projects = projectsData?.getProjectsForClient || [];

	const showError = (err) =>
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
			message: err.graphQLErrors?.[0]?.message || err.message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	const closeModal = () => setModal({ ...modal, isOpen: false });

	const handleAssign = (img) => {
		if (projects.length === 0) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: "This client has no projects yet to file an image onto.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
			return;
		}
		setModal({
			isOpen: true,
			title: "Assign to project",
			content: (
				<AssignImageForm
					projects={projects}
					onCancel={closeModal}
					onSubmit={(projectId, imageType) => {
						assignSharedImageToProject({
							variables: { sharedImageId: img.id, projectId, imageType },
						})
							.then(() => {
								closeModal();
								setAlert({
									isAlert: true,
									severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
									message: `Added to ${IMAGE_TYPE_LABEL[imageType]}.`,
									timeout: ALERT_CONSTANTS.TIMEOUT,
									location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
								});
							})
							.catch(showError);
					}}
				/>
			),
		});
	};

	const handleTagsUpdate = (img, newTags) => {
		updateSharedImageTags({ variables: { sharedImageId: img.id, tags: newTags } }).catch(
			showError
		);
	};

	const handleRemove = (img) =>
		removeSharedImageFromList({
			variables: { sharedImageId: img.id },
			// Evicted from the cache rather than refetching the whole list - the same reasoning
			// SharedImageService.js's own comment gives: this is a single-row removal, and Apollo
			// already has everything it needs to drop just that row.
			update: (cache) => {
				cache.evict({ id: cache.identify({ __typename: "SharedImage", id: img.id }) });
				cache.gc();
			},
		});

	if (loading && !data) {
		return null;
	}

	return (
		<IBCardWrapper>
			<h2 className="clientDashboardSectionTitle">Shared images</h2>
			<p className="clientDashboardNotesHint">
				Images shared by either side in messages with this client. File one onto a project
				to add it to that project's own References, Design, or Finished Tattoo list.
			</p>
			{images.length === 0 ? (
				<p className="clientDashboardEmpty">No images shared yet.</p>
			) : (
				<IBImagesList
					imageData={images}
					onTagsUpdate={handleTagsUpdate}
					onDelete={handleRemove}
					deleteLabel="Remove from this list"
					extraActions={[
						{
							label: "Assign to project",
							icon: <AssignmentTurnedIn fontSize="small" />,
							onClick: handleAssign,
						},
					]}
					renderBadge={(img) =>
						img.assignedProjectId
							? `Added to ${img.assignedProject?.title || "a project"}'s ${
									IMAGE_TYPE_LABEL[img.assignedImageType] || img.assignedImageType
							  }`
							: null
					}
				/>
			)}
		</IBCardWrapper>
	);
};

/**
 * The modal body for "Assign to project" - a project picker plus which of its three image lists.
 *
 * Was a hand-rolled `<form>` with two native `<select>` elements and bespoke CSS - visibly
 * different from every other modal-hosted form in this app (fonts, borders, focus states) and a
 * real instance of the exact thing being flagged: a new feature quietly inventing its own controls
 * instead of reusing the ones already established. Rebuilt on the same shell EntityWizard.jsx and
 * UpdateEventDialog.jsx already use for everything opened through IBModal - MUI `DialogContent
 * dividers` / `DialogActions` for the modal chrome (IBModal.jsx itself renders `modal.content`
 * with no padding of its own, so getting this right is each caller's job, not the modal's), and
 * `IBSelect` for both dropdowns, matching how FormFieldEditorRow.jsx already uses `IBSelect`
 * elsewhere. `IBSelect` renders its own MUI label internally (see IBSelect.jsx) - it is
 * deliberately NOT wrapped in `FormField` here, since that would be the exact "two labels for one
 * field" FormField's own header comment warns against; FormField is for bare inputs that don't
 * already carry a label, which IBSelect never is.
 */
const AssignImageForm = ({ projects, onCancel, onSubmit }) => {
	const [projectId, setProjectId] = useState(projects[0]?.id || "");
	const [imageType, setImageType] = useState(IMAGE_TYPE_OPTIONS[0].value);

	const projectOptions = projects.map((project) => ({
		value: project.id,
		label: `${project.title || "Untitled project"} (${project.status})`,
	}));

	return (
		<form
			className="sharedImagesAssignForm"
			onSubmit={(e) => {
				e.preventDefault();
				if (!projectId) {
					return;
				}
				onSubmit(projectId, imageType);
			}}
		>
			<DialogContent dividers className="sharedImagesAssignContent">
				<IBSelect
					id="sharedImageAssignProject"
					label="Project"
					data={projectOptions}
					selectedVal={projectId}
					onChange={(e) => setProjectId(e.target.value)}
				/>
				<IBSelect
					id="sharedImageAssignType"
					label="Add to"
					data={IMAGE_TYPE_OPTIONS}
					selectedVal={imageType}
					onChange={(e) => setImageType(e.target.value)}
				/>
			</DialogContent>
			<DialogActions className="sharedImagesAssignActions">
				<Button type="button" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" variant="contained" disabled={!projectId}>
					Add
				</Button>
			</DialogActions>
		</form>
	);
};

export default SharedImagesPanel;
