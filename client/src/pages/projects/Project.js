import { useParams, useNavigate } from "react-router-dom";
import "./project.css";
import ProjectService  from "../../services/ProjectService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";
import IBImagesUpload from "../../components/ibImagesUpload/IBImagesUpload";
import IBImagesList from "../../components/ibImagesList/IBImagesList";
import { useMutation } from "@apollo/client";

const Project = (props) => {
	const navigate = useNavigate();
	let params = useParams();
	const [updateProject] = useMutation(ProjectService.updateProject());
    const errors = {};
	const handleProjectReferencesUpdate = (project, updatedImages) => {
		//merges the new list of images with the old one and updates Mongo
		let updatedReferenceImages = updatedImages;
		updateProject({
			variables: {
				project: {
					...project,
					referenceImages: updatedImages,
				},
			},
		});
	}
	/**
	 * Gets project by id
	 */
	const { loading, data } = ProjectService.fetchProject(params.projectId);

	/**
	 * Handles the edit click event
	 */
	const handleEdit = (e) => {
		e.preventDefault();
		navigate(`${ROUTE_CONSTANTS.EDIT_PROJECT}${params.projectId}`);
	};

	const handleUpdate = (deletedImg) => {
		//remove the delete image and return a new references array
		const updatedReferenceList = data.getProject.referenceImages.filter((reference) => {
			return reference.url != deletedImg.url;
		});

		//need to remove the following properties in order to save.
		const { __typename, artist, client, ...project } = data.getProject;
		const referencesToSave = updatedReferenceList.map(({__typename, ...keepAttrs}) => keepAttrs);

		handleProjectReferencesUpdate(project, referencesToSave);
		console.log(data.getProject.referenceImages);
		console.log(updatedReferenceList);
	}

	if (loading) {
		return <IBPageLoader />;
	}

	if (data) {
		console.log(data.getProject);
		return (
			<div className="project">
				<div className="projectTitleContainer">
				<h1 className="projectTitle">
					{data.getProject.title}
				</h1>
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
					<IBImagesUpload project={data.getProject} title='References' />
					<IBImagesList imageData={data.getProject} updateCallback={handleUpdate} />
				</div>
			</div>
		);
	} else {
        errors.message = 'This project does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default Project