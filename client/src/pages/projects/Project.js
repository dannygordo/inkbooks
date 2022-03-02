import { useParams, useNavigate } from "react-router-dom";
import "./project.css";
import ProjectService from "../../services/ProjectService";
import { APP_SETTINGS_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";
import IBImagesUpload from "../../components/ibImagesUpload/IBImagesUpload";
import IBImagesList from "../../components/ibImagesList/IBImagesList";
import { useMutation } from "@apollo/client";
import IBCardWrapper from "../../components/card/ibCard/IBCardWrapper";
import IBInput from "../../components/inputs/IBInput";
import { useRef, useState } from "react";
import IBMultilineInput from "../../components/inputs/IBMultilineInput";
import { useAuth } from "../../context/auth";
import moment from "moment";
import IBProjectPalettesSelect from "../../components/inputs/IBProjectPalettesSelect";
import IBTagsWidget from "../../components/ibTagsWidget/IBTagsWidget";
import { Chip, ListItem, Paper } from "@mui/material";

const Project = (props) => {
	const navigate = useNavigate();
	const { user } = useAuth();
	let params = useParams();
	const errors = {};
	let updatedReferenceImages = [];
	let updatedDesignImages = [];
	let currentProject = {};
	let titleRef = useRef();
	let descriptionRef = useRef();
	let placementRef = useRef();
	let sizeRef = useRef();
	let paletteRef = useRef();
	let addNoteRef = useRef();
	let addTagRef = useRef();
	let selectPaletteRef = useRef();
	/**
	 * Gets project by id
	 */
	const { loading, data } = ProjectService.fetchProject(params.projectId);
	const [updateProject] = useMutation(ProjectService.updateProject());
	/**
	 * Updates the project notes and then refetches the fetchProject mutation
	 */
	const [updateProjectNotes] = useMutation(
		ProjectService.updateProjectNotes(),
		{
			refetchQueries: [
				{
					query: ProjectService.fetchProjectGQL,
					variables: { projectId: params.projectId },
				},
			],
		}
	);
	const [updateProjectTags] = useMutation(
		ProjectService.updateProjectTags(),
		{
			refetchQueries: [
				{
					query: ProjectService.fetchProjectGQL,
					variables: { projectId: params.projectId },
				},
			],
		}
	);

	/**
	 *  Takes a list of references images and updates project
	 * @param {List of reference images to pass to useMutation} updatedImages
	 */
	const handleProjectReferencesUpdate = (updatedImages) => {
		console.log(updatedImages);
		updateProject({
			variables: {
				project: {
					...currentProject,
					referenceImages: updatedImages,
					designImages: updatedDesignImages,
				},
			},
		});
	};

	/**
	 * Takes a list of design images and updates project
	 * @param {List of design images to pass to useMutation} updatedImages
	 */
	const handleProjectDesignsUpdate = (updatedImages) => {
		console.log(updatedImages);
		updateProject({
			variables: {
				project: {
					...currentProject,
					designImages: updatedImages,
					referenceImages: updatedReferenceImages,
				},
			},
		});
	};

	/**
	 * Formats the new note into an IBNote object, formats the old notes for storage, and calls updateProjectNotes mutation
	 * @param {author, note, createdAt, updatedAt} note
	 */
	const handleNotesUpdate = (note) => {
		const newNote = {
			author: `${user.userInfo.firstName} ${user.userInfo.lastName}`,
			note: note,
			createdAt: new Date(Date.now()).toISOString(),
			updatedAt: new Date(Date.now()).toISOString(),
		};
		const notesToSave = data.getProject.notes.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);
		const updatedNotes = [...notesToSave, newNote];
		updateProjectNotes({
			variables: {
				projectId: data.getProject.id,
				notes: updatedNotes,
			},
		});
	};

	const handleTagsUpdate = (tag) => {
		const updatedTags = [...data.getProject.tags, tag];
		updateProjectTags({
			variables: {
				projectId: data.getProject.id,
				tags: updatedTags
			}
		});
	};

	const handleDeleteTag = (tagToDelete) => {
		const updatedTags = data.getProject.tags.filter((tag) => tag !== tagToDelete)
		updateProjectTags({
			variables: {
				projectId: data.getProject.id,
				tags: updatedTags
			}
		});
	}

	/**
	 * Handles the edit click event
	 */
	const handleEdit = (e) => {
		e.preventDefault();
		//navigate(`${ROUTE_CONSTANTS.EDIT_PROJECT}${params.projectId}`);
		console.log(selectPaletteRef.current.value);
	};

	/**
	 * A helper function to remove properies from the IBImage as well as filtering out image to delete.  Passes new referenceImages array to handleProjectReferencesUpdate for mutation.
	 * @param {Image to delete from Project.referenceImages array} deletedImg
	 * @param {List of current Project.referenceImages } imageList
	 */
	const formatReferencesForUpdate = (deletedImg, imageList) => {
		const updatedReferenceList = imageList.filter((reference) => {
			return reference.url != deletedImg.url;
		});

		const referencesToSave = updatedReferenceList.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);

		handleProjectReferencesUpdate(referencesToSave);
	};

	/**
	 * A helper function to remove properies from the IBImage as well as filtering out image to delete.  Passes new designImages array to handleProjectDesignsUpdate for mutation.
	 * @param {Image to delete from Project.designImages array} deletedImg
	 * @param {List of current Project.designImages } imageList
	 */
	const formatDesignsForUpdate = (deletedImg, imageList) => {
		const updatedDesignsList = imageList.filter((design) => {
			return design.url != deletedImg.url;
		});

		const designsToSave = updatedDesignsList.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);
		console.log(designsToSave);
		handleProjectDesignsUpdate(designsToSave);
	};

	/**
	 * Calls the proper formatting function based on image type
	 * @param {Image to delete} deletedImg
	 * @param {The type of images to delete from the Project object} imageType
	 * @returns
	 */
	const handleUpdate = (deletedImg, imageType) => {
		const { __typename, artist, client, ...project } = data.getProject;
		currentProject = project;
		updatedReferenceImages = project.referenceImages.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);
		updatedDesignImages = project.designImages.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);
		switch (imageType) {
			case APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.REFERENCE:
				formatReferencesForUpdate(deletedImg, updatedReferenceImages);
				break;
			case APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.DESIGN:
				formatDesignsForUpdate(deletedImg, updatedDesignImages);
				break;
			default:
				return null;
		}
	};
	if (loading) {
		return <IBPageLoader />;
	}

	if (data) {
		return (
			<div className="project">
				<div className="projectTitleContainer">
					<h1 className="projectTitle">{data.getProject.title}</h1>
					<div className="projectActions">
						<div className="projectActionItem">
							<button
								onClick={handleEdit}
								className="projectButton"
								disabled={params.projectId && false}
							>
								Edit Project
							</button>
						</div>
					</div>
				</div>
				<div className="projectContainer">
					<IBCardWrapper>
						<IBInput
							id="title"
							inputRef={titleRef}
							label="Title"
							defaultValue={data.getProject.title}
						/>
						<IBMultilineInput
							id="description"
							label="Description"
							inputRef={descriptionRef}
							defaultValue={data.getProject.description}
						/>
						<IBInput
							id="placement"
							label="Placement"
							inputRef={placementRef}
							defaultValue={data.getProject.placement}
						/>
						<IBInput
							id="size"
							label="Approx. Size in Inches"
							inputRef={sizeRef}
							defaultValue={data.getProject.size}
						/>
						<IBInput
							id="palette"
							label="Palette"
							inputRef={paletteRef}
							defaultValue={data.getProject.palette}
						/>
						<IBProjectPalettesSelect
							inputRef={selectPaletteRef}
							selectValue={data.getProject.palette}
							defaultValue={data.getProject.palette}
						/>
					</IBCardWrapper>
				</div>
				<div className="projectContainer" style={{ display: "flex" }}>
					<IBCardWrapper>
						<div>
							<h1 className="projectTitle">Notes</h1>
							<div className="projectActions">
								<div className="projectActionItem">
									<IBMultilineInput
										id="addNote"
										inputRef={addNoteRef}
										label="Add Note"
										helperText="Add note and press enter to save"
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												console.log(e.target.value);
												handleNotesUpdate(
													e.target.value
												);
											}
										}}
									/>
								</div>
							</div>
							<div>
								<ul className="projectUList">
									{data.getProject.notes
										.map((note, index) => {
											return (
												<li
													className="projectUListItem"
													key={index}
												>
													<div className="projectNoteContainer">
														<div className="projectNoteContent">
															{note.note}
														</div>
														<div className="projectNoteAuthor">
															- {note.author} @{" "}
															{moment(
																note.createdAt
															).fromNow()}
														</div>
													</div>
												</li>
											);
										})
										.reverse()}
								</ul>
							</div>
						</div>
					</IBCardWrapper>
					<IBCardWrapper>
						<div>
							<h1 className="projectTitle">Tags</h1>
							<div className="projectActions">
								<div className="projectActionItem">
									<IBMultilineInput
										id="addTag"
										inputRef={addTagRef}
										label="Add Tag"
										helperText="Add tag you'd like to be able to search against and press enter"
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleTagsUpdate(
													e.target.value
												);
											}
										}}
									/>
								</div>
							</div>
							<div>
								<IBTagsWidget tags={data.getProject.tags} onDelete={handleDeleteTag} />
							</div>
						</div>
					</IBCardWrapper>
				</div>
				<div className="projectContainer">
					<IBCardWrapper>
						<IBImagesUpload
							project={data.getProject}
							title="References"
							label="Refererences"
						/>
						<IBImagesList
							imageData={data.getProject.referenceImages}
							imageType="reference"
							updateCallback={handleUpdate}
						/>
					</IBCardWrapper>
				</div>
				<div className="projectContainer">
					<IBCardWrapper>
						<IBImagesUpload
							project={data.getProject}
							title="Design"
							label="Designs"
						/>
						<IBImagesList
							imageData={data.getProject.designImages}
							imageType="design"
							updateCallback={handleUpdate}
						/>
					</IBCardWrapper>
				</div>
			</div>
		);
	} else {
		errors.message = "This project does not exist.";
		return <IBCardShowError errors={errors} />;
	}
};
export default Project;
