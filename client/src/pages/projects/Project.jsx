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
import React, { useEffect, useRef, useState } from "react";
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
import { formatCents, dollarsToCents } from "../../utils/money";
import ProjectSessionsList from "../../components/projectSessions/ProjectSessionsList";
import { AppointmentService } from "../../services/AppointmentService";
import DepositService from "../../services/DepositService";

// A project usually has exactly one deposit, but the schema allows several (a consult that took
// two payments), so this says "Cash", "Card", or "Cash + Card" rather than silently reporting
// whichever happened to be first.
const depositMethodLabel = (deposits) => {
	const methods = new Set(
		(deposits || []).filter((d) => d.depositCents > 0).map((d) => d.depositPaymentMethod)
	);
	const labels = [];
	if (methods.has("cash")) labels.push("Cash");
	if (methods.has("square")) labels.push("Card");
	return labels.join(" + ");
};

const Project = (props) => {
	const navigate = useNavigate();
	const { user, setModal, modal, setAlert } = useAuth();
	let params = useParams();
	const errors = {};
	let updatedReferenceImages = [];
	let updatedDesignImages = [];
	let updatedBodyImages = [];
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
	// "Add Deposit" form state - see the projectDepositReadout block below.
	const [showAddDepositForm, setShowAddDepositForm] = useState(false);
	const [addDepositDollars, setAddDepositDollars] = useState("");
	const [addDepositError, setAddDepositError] = useState(null);

	/**
	 * Gets project by id
	 */
	const { loading, data, refetch: refetchProject } = ProjectService.fetchProject(
		params.projectId,
		setActiveMessages
	);

	// Needed only to answer "is every session on this project already closed" for the Add Deposit
	// gate below - a deposit is credited against a session still to come, so once none is left
	// open there's nothing left for new money to apply to.
	const { data: sessionsData } = AppointmentService.getAppointmentsByProject(params.projectId);
	const sessions = sessionsData?.getAppointmentsByProject || [];
	const hasOpenSession = sessions.length === 0 || sessions.some((s) => s.appointmentStatus !== "completed");

	const [recordDeposit, { loading: addingDeposit }] = useMutation(DepositService.RECORD_DEPOSIT);

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
	 *  Takes a list of finished-tattoo (body) images and updates project. Same shape as
	 *  handleProjectReferencesUpdate/handleProjectDesignsUpdate above - see typeDefs.js's
	 *  Project.bodyImages comment for why this is now an IBImageInput array rather than [String].
	 * @param {List of body images to pass to useMutation} updatedImages
	 */
	const handleProjectBodyImagesUpdate = (updatedImages) => {
		updateProject({
			variables: {
				project: {
					id: params.projectId,
					title: data.getProject.title,
					description: data.getProject.description,
					clientId: data.getProject.clientId,
					artistId: data.getProject.artistId,
					status: data.getProject.status,
					bodyImages: updatedImages
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
	// `||`, not `??`: once a field's input has mounted, a null/undefined underlying value
	// still leaves ref.current.value as a real empty string (the DOM has no way to represent
	// an unset text input), so `?? data.field` never actually falls through post-mount and a
	// field that was genuinely null got silently written back as "" on every unrelated blur.
	// `||` falls back to the original value both before mount (ref undefined) and for an
	// untouched-but-null field after mount (ref.current.value === ""), and still prefers
	// anything actually typed.
	const buildDetailsPayload = () => ({
		id: data.getProject.id,
		title: titleRef.current?.value || data.getProject.title,
		description: descriptionRef.current?.value || data.getProject.description,
		placement: placementRef.current?.value || data.getProject.placement,
		size: sizeRef.current?.value || data.getProject.size,
		palette: selectPaletteRef.current?.value || data.getProject.palette,
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

	// "Add Deposit" - lets an artist put more cash down against this project's consult after the
	// fact (a client who adds to their deposit on a later visit, before the work is billed). Tops
	// up the SAME consult transaction recordDeposit already tracks, rather than opening a second,
	// competing entry point for deposit money - see DepositService.RECORD_DEPOSIT and
	// resolvers/index.js's Project.consultAppointment. Cash only: recordDeposit's amount is a
	// straight overwrite of depositCents, which is safe for cash (a fresh, larger figure the
	// artist is asserting) but would be wrong for a card top-up - the deposit may already be
	// 'available' (collected), and re-charging the WHOLE new total through Square would charge the
	// client a second time for money already taken. A card top-up needs a charge for only the
	// increment, which this button does not attempt.
	const handleAddDeposit = async (e) => {
		e.preventDefault();
		setAddDepositError(null);
		const consult = data.getProject.consultAppointment;
		if (!consult) {
			return;
		}
		const addCents = dollarsToCents(addDepositDollars);
		if (!addCents || addCents <= 0) {
			setAddDepositError("Enter an amount greater than $0.");
			return;
		}
		try {
			await recordDeposit({
				variables: {
					appointmentId: consult.id,
					depositCents: (consult.depositCents || 0) + addCents,
					paymentMethod: "cash",
				},
			});
			setAddDepositDollars("");
			setShowAddDepositForm(false);
			await refetchProject();
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: "Deposit updated.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		} catch (err) {
			setAddDepositError(err.graphQLErrors?.[0]?.message || err.message);
		}
	};

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
	 * A helper function to remove properties from the IBImage as well as filtering out image to delete.  Passes new bodyImages array to handleProjectBodyImagesUpdate for mutation.
	 * @param {Image to delete from Project.bodyImages array} deletedImg
	 * @param {List of current Project.bodyImages } imageList
	 */
	const formatBodyImagesForUpdate = (deletedImg, imageList) => {
		const updatedBodyImagesList = imageList.filter((bodyImage) => {
			return bodyImage.url != deletedImg.url;
		});

		const bodyImagesToSave = updatedBodyImagesList.map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);
		handleProjectBodyImagesUpdate(bodyImagesToSave);
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
		updatedBodyImages = (project.bodyImages || []).map(
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
			case APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.BODY:
				formatBodyImagesForUpdate(deletedImg, updatedBodyImages);
				break;
			default:
				return null;
		}
	};

	/**
	 * Applies a new tags array to a single image within one of the three image collections and
	 * saves it. Groundwork for search: tags live on IBImage.tags (server/graphql/typeDefs.js),
	 * not on the Project itself, so they can eventually be queried per-image rather than just
	 * per-project the way Project.tags already is.
	 * @param {The image whose tags changed} img
	 * @param {The image's new, complete tags array} newTags
	 * @param {Which collection img belongs to - reference/design/body} imageType
	 */
	const handleImageTagsUpdate = (img, newTags, imageType) => {
		const applyTags = (imageList) =>
			imageList.map(({ __typename, userInfo, ...keepAttrs }) =>
				keepAttrs.id === img.id ? { ...keepAttrs, tags: newTags } : keepAttrs
			);

		switch (imageType) {
			case APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.REFERENCE:
				handleProjectReferencesUpdate(applyTags(data.getProject.referenceImages));
				break;
			case APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.DESIGN:
				handleProjectDesignsUpdate(applyTags(data.getProject.designImages));
				break;
			case APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.BODY:
				handleProjectBodyImagesUpdate(applyTags(data.getProject.bodyImages || []));
				break;
			default:
				return null;
		}
	};

	if (loading) {
		return <IBPageLoader />;
	}
	// Lazy baseline init (allowed during render for a ref - this exact pattern is called
	// out in React's own docs): lastSavedDetailsRef starts null, and the build*Payload fallbacks
	// read from data itself for every ref that hasn't attached to a real input yet, which
	// is every ref on the render where data first arrives. Without this, the first blur
	// ever - even one that changed nothing - looks 'dirty' against a null baseline and
	// fires a save no one asked for.
	if (data && data.getProject && lastSavedDetailsRef.current === null) {
		lastSavedDetailsRef.current = JSON.stringify(buildDetailsPayload());
	}

	if (data && data.getProject) {
		return (
			<div className="project">
				<div className="projectTitleContainer">
					<h1 className="projectTitle">{data.getProject.title}</h1>
					{/* The client this project belongs to - right-justified so it reads as an
					    attribution for the title rather than another heading, and placed here (above
					    the Details card) since Details itself has no room for a title-level fact.
					    A bubble rather than plain text so it reads as a link to somewhere, not as
					    more title - clicking it goes to the client's own dashboard page. */}
					{data.getProject.client?.id ? (
						<Chip
							className="projectClientBubble"
							label={`${data.getProject.client?.firstName || ""} ${
								data.getProject.client?.lastName || ""
							}`.trim()}
							onClick={() =>
								navigate(`${ROUTE_CONSTANTS.CLIENT}${data.getProject.client.id}`)
							}
							clickable
						/>
					) : (
						<span className="projectClientBubble projectClientBubbleStatic">
							{data.getProject.client?.firstName} {data.getProject.client?.lastName}
						</span>
					)}
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
									{/* Cash or card. Without it a deposit is just an amount someone
									    typed, and neither the drawer nor the Square dashboard can
									    be reconciled against it. */}
									{depositMethodLabel(data.getProject.deposits) && (
										<span className="projectDepositMethod">
											{" "}({depositMethodLabel(data.getProject.deposits)})
										</span>
									)}
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
						{/* Add Deposit - only offered when there's a consult to attach the money to, it
						    hasn't already been spent on a session, and at least one session on this
						    project is still open to apply it against. Once every session is closed
						    there's nothing left for new deposit money to be credited toward. */}
						{data.getProject.consultAppointment &&
							data.getProject.consultAppointment.depositStatus !== "applied" &&
							hasOpenSession && (
								<div className="projectAddDeposit">
									{showAddDepositForm ? (
										<form
											className="projectAddDepositForm"
											onSubmit={handleAddDeposit}
										>
											<IBInput
												label="Add to deposit $"
												type="number"
												placeholder="0"
												helperText="Cash only - recorded immediately against the consult"
												value={addDepositDollars}
												onChange={(e) => setAddDepositDollars(e.target.value)}
												autoFocus
											/>
											{addDepositError && (
												<div className="bookingRequestError">{addDepositError}</div>
											)}
											<div className="projectAddDepositFormButtons">
												<Button
													type="submit"
													variant="contained"
													size="small"
													disabled={addingDeposit}
												>
													{addingDeposit ? "Saving..." : "Add"}
												</Button>
												<Button
													type="button"
													size="small"
													disabled={addingDeposit}
													onClick={() => {
														setShowAddDepositForm(false);
														setAddDepositError(null);
														setAddDepositDollars("");
													}}
												>
													Cancel
												</Button>
											</div>
										</form>
									) : (
										<Button
											size="small"
											variant="outlined"
											onClick={() => setShowAddDepositForm(true)}
										>
											Add Deposit
										</Button>
									)}
								</div>
							)}
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
									<IBInput
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
									<IBInput
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
							imageType={APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.REFERENCE}
							updateCallback={handleUpdate}
							onTagsUpdate={handleImageTagsUpdate}
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
							imageType={APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.DESIGN}
							updateCallback={handleUpdate}
							onTagsUpdate={handleImageTagsUpdate}
						/>
					</IBCardWrapper>
				</div>
				<div className="projectContainer">
					<IBCardWrapper>
						<IBImagesUpload
							project={data.getProject}
							title="Finished Tattoo"
							label="Finished Tattoo"
						/>
						<IBImagesList
							imageData={data.getProject.bodyImages || []}
							imageType={APP_SETTINGS_CONSTANTS.PROJECT_IMAGE_TYPES.BODY}
							updateCallback={handleUpdate}
							onTagsUpdate={handleImageTagsUpdate}
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
