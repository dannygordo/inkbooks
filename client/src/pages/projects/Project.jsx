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
import { useEffect, useRef, useState } from "react";
import IBMultilineInput from "../../components/inputs/IBMultilineInput";
import { useAuth } from "../../context/auth";
import moment from "moment";
import IBProjectPalettesSelect from "../../components/inputs/IBProjectPalettesSelect";
import IBTagsWidget from "../../components/ibTagsWidget/IBTagsWidget";
import { Button, Chip, Fab, ListItem, Paper } from "@mui/material";
import { Save } from "@mui/icons-material";
import IBChatBox from "../../components/ibChatBox/IBChatBox";
import { ObjectID } from "bson";
import MessengerService from "../../services/MessengerService";
import IBSquarePaymentForm from "../../components/IBSquarePayments/IBSquarePaymentForm";
import { ALERT_CONSTANTS } from "../../constants";

const Project = (props) => {
	const navigate = useNavigate();
	const { user, setModal, modal, setAlert } = useAuth();
	let params = useParams();
	const errors = {};
	let updatedReferenceImages = [];
	let updatedDesignImages = [];
	let currentProject = {};
	let titleRef = useRef();
	let descriptionRef = useRef();
	let placementRef = useRef();
	let sizeRef = useRef();
	let addNoteRef = useRef();
	let addTagRef = useRef();
	let selectPaletteRef = useRef();
	let depositAmountRef = useRef();
	const [activeMessages, setActiveMessages] = useState([]);
	const [projectTags, setProjectTags] = useState([]);

	/**
	 * Gets project by id
	 */
	const { loading, data } = ProjectService.fetchProject(
		params.projectId,
		setActiveMessages
	);

	useEffect(() => {
		console.log(user);
		console.log('project data updated');
	}, [data]);

	const [updateProject] = useMutation(ProjectService.updateProject());

	/**
	 *  Takes a list of references images and updates project
	 * @param {List of reference images to pass to useMutation} updatedImages
	 */
	const handleProjectReferencesUpdate = (updatedImages) => {
		updateProject({
			variables: {
				project: {
					id: params.projectId,
					title: data.getProject.title,
					description: data.getProject.description,
					clientId: data.getProject.clientId,
					artistId: data.getProject.artistId,
					status: data.getProject.status,
					referenceImages: updatedImages
				},
			},
		});
	};

	/**
	 * Takes a list of design images and updates project
	 * @param {List of design images to pass to useMutation} updatedImages
	 */
	const handleProjectDesignsUpdate = (updatedImages) => {
		updateProject({
			variables: {
				project: {
					id: params.projectId,
					title: data.getProject.title,
					description: data.getProject.description,
					clientId: data.getProject.clientId,
					artistId: data.getProject.artistId,
					status: data.getProject.status,
					designImages: updatedImages
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
			id: new ObjectID(),
			author: `${user.userInfo.firstName} ${user.userInfo.lastName}`,
			note: note,
			createdAt: new Date(Date.now()).toISOString(),
			updatedAt: new Date(Date.now()).toISOString(),
		};
		const notesToSave = data.getProject.notes.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);
		const updatedNotes = [...notesToSave, newNote];
		updateProject({
			variables: {
				project: {
					id: params.projectId,
					title: data.getProject.title,
					description: data.getProject.description,
					clientId: data.getProject.clientId,
					artistId: data.getProject.artistId,
					status: data.getProject.status,
					notes: updatedNotes
				},
			}
		});
	};

	const handleTagsUpdate = (e, tag) => {
		e.preventDefault();
		if (data.getProject.tags.lastIndexOf(tag) < 0) {
			const updatedTags = [...data.getProject.tags, tag];
			updateProject({
				variables: {
					project: {
						id: params.projectId,
						tags: updatedTags,
						title: data.getProject.title,
						description: data.getProject.description,
						clientId: data.getProject.clientId,
						artistId: data.getProject.artistId,
						status: data.getProject.status
					},
				}
			});
		} else {
			addTagRef.current.value = "";
		}
	};

	const handleDeleteTag = (e, tagToDelete) => {
		e.preventDefault();
		console.log(tagToDelete);
		const updatedTags = data.getProject.tags.filter(
			(tag) => tag !== tagToDelete
		);
		updateProject({
			variables: {
				project: {
					id: params.projectId,
					tags: updatedTags,
					title: data.getProject.title,
					description: data.getProject.description,
					clientId: data.getProject.clientId,
					artistId: data.getProject.artistId,
					status: data.getProject.status
				},
			}
		});
	};

	const handleUpdateDetails = (e) => {
		e.preventDefault();
		console.log(descriptionRef.current.value);
		updateProject({
			variables: {
				project: {
					id: data.getProject.id,
					title: titleRef.current.value,
					description: descriptionRef.current.value,
					placement: placementRef.current.value,
					size: sizeRef.current.value,
					palette: selectPaletteRef.current.value,
					clientId: data.getProject.clientId,
					artistId: data.getProject.artistId,
					status: data.getProject.status,
					depositAmount: depositAmountRef.current.value
						? parseInt(depositAmountRef.current.value)
						: 0,
				},
			},
		});
	};

	/**
	 * Opens the global IBModal with a Square payment form pre-filled to this project's current
	 * depositAmount (whatever was last saved via handleUpdateDetails - not the unsaved ref value,
	 * so this always charges the amount actually on record). Sandbox-only right now, see
	 * IBSquarePaymentForm.jsx and server/routes/squarePayments.js for why.
	 */
	const handlePayDepositClick = (e) => {
		e.preventDefault();
		const amountCents = Math.round(data.getProject.depositAmount * 100);
		setModal({
			isOpen: true,
			title: "Pay Deposit",
			content: (
				<IBSquarePaymentForm
					amountCents={amountCents}
					note={`Deposit for project ${data.getProject.title}`}
					onSuccess={() => {
						setModal({ ...modal, isOpen: false });
						setAlert({
							isAlert: true,
							severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
							message: "Deposit paid successfully.",
							timeout: ALERT_CONSTANTS.TIMEOUT,
							location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
						});
					}}
					onError={(message) => {
						setAlert({
							isAlert: true,
							severity: ALERT_CONSTANTS.SEVERITY.ERROR,
							message: `Payment failed: ${message}`,
							timeout: ALERT_CONSTANTS.TIMEOUT,
							location: ALERT_CONSTANTS.DISPLAY_MODAL,
						});
					}}
				/>
			),
		});
	};

	/**
	 * Handles the edit click event
	 */
	const handleEdit = (e) => {
		e.preventDefault();
		//navigate(`${ROUTE_CONSTANTS.EDIT_PROJECT}${params.projectId}`);
		console.log(selectPaletteRef.current.value);
	};

	/**
	 * A helper function to remove properties from the IBImage as well as filtering out image to delete.  Passes new referenceImages array to handleProjectReferencesUpdate for mutation.
	 * @param {Image to delete from Project.referenceImages array} deletedImg
	 * @param {List of current Project.referenceImages } imageList
	 */
	const formatReferencesForUpdate = (deletedImg, imageList) => {
		const updatedReferenceList = imageList.filter((reference) => {
			return reference.url != deletedImg.url;
		});

		const referencesToSave = updatedReferenceList.map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);
			console.log(referencesToSave);
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
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
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
		console.log("pipstits");
		const { __typename, artist, client, conversation, ...project } =
			data.getProject;
		currentProject = project;
		updatedReferenceImages = project.referenceImages.map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);
		updatedDesignImages = project.designImages.map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);
		switch (imageType) {
			case APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.REFERENCE:
				console.log("refs");
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
				<div className="projectContainer" style={{ display: "flex" }}>
					<IBCardWrapper>
						<h1 className="projectTitle">Messages</h1>
						<IBChatBox
							widget={true}
							isInputDisabled={data.getProject.artistId !== user.id}
							conversation={data.getProject.conversation}
							messages={activeMessages}
							setActiveMessages={setActiveMessages}
						/>
					</IBCardWrapper>
					<IBCardWrapper>
						<div>
							<h1>Details</h1>
						</div>
						<div className="projectDetailsActions">
							<Fab
								className="imagesUploadButton"
								sx={{ backgroundColor: "#333", color: "#ddd" }}
								aria-label="Save Project"
								onClick={handleUpdateDetails}
							>
								<Save fontSize="medium" />
							</Fab>
						</div>
						<IBInput
							id="title"
							inputRef={titleRef}
							label="Title"
							helperText=" "
							defaultValue={data.getProject.title}
						/>
						<IBMultilineInput
							id="description"
							label="Description"
							helperText=" "
							inputRef={descriptionRef}
							defaultValue={data.getProject.description}
						/>
						<IBInput
							id="placement"
							label="Placement"
							helperText=" "
							inputRef={placementRef}
							defaultValue={data.getProject.placement}
						/>
						<IBInput
							id="size"
							label="Approx. Size in Inches"
							helperText=" "
							inputRef={sizeRef}
							defaultValue={data.getProject.size}
						/>
						<IBInput
							id="depositAmount"
							label="Deposit Amount $"
							helperText=" "
							sx={{ m: 1, width: "25ch" }}
							type="number"
							inputRef={depositAmountRef}
							defaultValue={data.getProject.depositAmount}
						/>
						<Button
							variant="outlined"
							sx={{ m: 1 }}
							onClick={handlePayDepositClick}
							disabled={
								!data.getProject.depositAmount ||
								data.getProject.depositAmount <= 0
							}
						>
							Pay Deposit
						</Button>
						<div>
							<IBProjectPalettesSelect
								inputRef={selectPaletteRef}
								selectValue={data.getProject.palette}
								defaultValue={data.getProject.palette}
							/>
						</div>
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
							<div className="projectNoteListWrapper">
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
													e,
													e.target.value
												);
											}
										}}
									/>
								</div>
							</div>
							<div>
								<IBTagsWidget
									tags={data.getProject.tags}
									onDelete={handleDeleteTag}
								/>
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
