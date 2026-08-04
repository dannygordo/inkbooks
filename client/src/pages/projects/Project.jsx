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
import { Button, Chip, ListItem, Paper } from "@mui/material";
import IBChatBox from "../../components/ibChatBox/IBChatBox";
import { ObjectID } from "bson";
import MessengerService from "../../services/MessengerService";
import { ALERT_CONSTANTS } from "../../constants";
import { formatCents } from "../../utils/money";
import ProjectSessionsList from "../../components/projectSessions/ProjectSessionsList";

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
	const [activeMessages, setActiveMessages] = useState([]);
	// Autosave bookkeeping for the Details panel. lastSavedDetailsRef holds a serialized copy of
	// the last payload actually sent, which is what the dirty check compares against - see
	// handleDetailFieldBlur.
	const lastSavedDetailsRef = useRef(null);
	const [detailsSaveState, setDetailsSaveState] = useState("idle");
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

	/**
	 * Autosave for the Details panel, called when a field loses focus.
	 *
	 * Replaces a Save button that sat in the corner of the panel. Two reasons it's better gone:
	 * a form that looks editable but silently discards what you typed unless you find the right
	 * button is a trap, and that button was three fields away from the last one you edited.
	 *
	 * ON BLUR, NOT ON CHANGE. Saving per keystroke would fire a mutation per character and write
	 * a half-typed title to the database on the way to a finished one. Blur is the moment a field
	 * is actually done being edited.
	 *
	 * The dirty check is what makes this safe to attach to every field: tabbing through the panel
	 * without typing anything, or clicking in and straight back out, changes nothing and must not
	 * write. Without it every focus/blur cycle would be a mutation, and the whole form would be
	 * re-sent each time - so a stale value in one field could overwrite a fresh one saved from
	 * another.
	 */
	const buildDetailsPayload = () => ({
		id: data.getProject.id,
		title: titleRef.current?.value ?? data.getProject.title,
		description: descriptionRef.current?.value ?? data.getProject.description,
		placement: placementRef.current?.value ?? data.getProject.placement,
		size: sizeRef.current?.value ?? data.getProject.size,
		palette: selectPaletteRef.current?.value ?? data.getProject.palette,
		clientId: data.getProject.clientId,
		artistId: data.getProject.artistId,
		status: data.getProject.status,
		// depositAmount is deliberately NOT sent. It's the deprecated whole-dollar field from
		// before deposits moved onto appointments, and nothing writes it any more - echoing it
		// back would keep a stale number alive beside the real one.
	});

	const handleDetailFieldBlur = async () => {
		const payload = buildDetailsPayload();
		// Compared against the last payload actually sent rather than against the server's copy,
		// so two saves in a row from different fields both go through while a no-op blur doesn't.
		const serialized = JSON.stringify(payload);
		if (serialized === lastSavedDetailsRef.current) {
			return;
		}
		lastSavedDetailsRef.current = serialized;
		setDetailsSaveState("saving");
		try {
			await updateProject({ variables: { project: payload } });
			setDetailsSaveState("saved");
		} catch (err) {
			// The save state is reset so the next blur retries rather than believing the field is
			// already persisted - an autosave that fails silently is worse than a Save button,
			// because there's nothing left for the user to press.
			lastSavedDetailsRef.current = null;
			setDetailsSaveState("error");
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: `Couldn't save: ${err.graphQLErrors?.[0]?.message || err.message}`,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	// The "Pay Deposit" button and its Square form that used to live here are gone. A deposit is
	// taken at the consult, by the artist, at the moment the consult becomes a session - not later
	// from a project page by whoever happens to be looking at it. Collecting one from here would
	// be a second, competing way for the same money to enter the system, with no consult
	// transaction to attach it to.

	// The corner "Edit Project" button is gone, along with its handler. Worth recording what that
	// handler actually did: its navigate() call was commented out and the body was a
	// console.log of a palette ref - so the button rendered on every project page and did
	// literally nothing when clicked. Every field it implied you could edit is already editable
	// in place further down this page.

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
						{/* The Save button that used to sit here is gone - fields save themselves when
						    they lose focus. Replaced with a status line rather than nothing at all:
						    autosave with no feedback leaves people unsure whether an edit took, and the
						    answer to "did that save" should be on screen rather than inferred. */}
						<div className="projectDetailsActions">
							<span
								className={`projectDetailsSaveState projectDetailsSaveState--${detailsSaveState}`}
							>
								{detailsSaveState === "saving" && "Saving..."}
								{detailsSaveState === "saved" && "All changes saved"}
								{detailsSaveState === "error" && "Couldn't save - try again"}
							</span>
						</div>
						<IBInput
							id="title"
							inputRef={titleRef}
							onBlur={handleDetailFieldBlur}
							label="Title"
							helperText=" "
							defaultValue={data.getProject.title}
						/>
						<IBMultilineInput
							id="description"
							label="Description"
							helperText=" "
							inputRef={descriptionRef}
							onBlur={handleDetailFieldBlur}
							defaultValue={data.getProject.description}
						/>
						<IBInput
							id="placement"
							label="Placement"
							helperText=" "
							inputRef={placementRef}
							onBlur={handleDetailFieldBlur}
							defaultValue={data.getProject.placement}
						/>
						<IBInput
							id="size"
							label="Approx. Size in Inches"
							helperText=" "
							inputRef={sizeRef}
							onBlur={handleDetailFieldBlur}
							defaultValue={data.getProject.size}
						/>
						{/* Read-only. A deposit isn't a project property someone types in - it's a
						    payment that either happened at the consult or didn't, and the record of
						    it lives on the appointment that took it (see models/Appointment.js). An
						    editable box here would let someone write a number no money corresponds
						    to. Plenty of projects won't have one. */}
						<div className="projectDepositReadout">
							<span className="projectDepositLabel">Deposit</span>
							{data.getProject.depositCollectedCents > 0 ? (
								<span className="projectDepositValue">
									{formatCents(data.getProject.depositCollectedCents)} taken at consult
									<span className="projectDepositNote">
										{data.getProject.depositAvailableCents > 0
											? ` - ${formatCents(
													data.getProject.depositAvailableCents
											  )} still to apply to a session`
											: " - already applied to a session"}
									</span>
								</span>
							) : (
								<span className="projectDepositValue projectDepositValueNone">
									None taken
								</span>
							)}
						</div>
						<div>
							{/* A select has no meaningful "done editing" moment - picking an option IS the
							    edit, and waiting for blur would leave a changed value unsaved until the
							    user happened to click elsewhere. Saved on change instead. */}
							<IBProjectPalettesSelect
								inputRef={selectPaletteRef}
								selectValue={data.getProject.palette}
								defaultValue={data.getProject.palette}
								onChange={handleDetailFieldBlur}
							/>
						</div>
					</IBCardWrapper>
				</div>
				<div className="projectContainer">
					<IBCardWrapper>
						<div>
							<h1 className="projectTitle">Sessions</h1>
							<ProjectSessionsList project={data.getProject} />
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
