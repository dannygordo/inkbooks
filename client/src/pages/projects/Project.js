import { useParams, useNavigate } from "react-router-dom";
import "./project.css";
import ProjectService  from "../../services/ProjectService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";

const Project = (props) => {
	const navigate = useNavigate();
	let params = useParams();
    const errors = {};
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

	if (loading) {
		return <IBPageLoader />;
	}

	if (data) {
		return (
			<div className="project">
				<h1 className="projectTitle">
					{data.getProject.title}
				</h1>
				<div>
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
			</div>
		);
	} else {
        errors.message = 'This project does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default Project