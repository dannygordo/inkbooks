import { useParams, useNavigate } from "react-router-dom";
import "./staffProfile.css";
import StaffService  from "../../services/StaffService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";

const StaffProfile = (props) => {
	const navigate = useNavigate();
	let params = useParams();
    const errors = {};
	/**
	 * Gets staffProfile by id
	 */
	const { loading, data } = StaffService.fetchOneStaff(params.staffId);

	/**
	 * Handles the edit click event
	 */
	const handleEdit = (e) => {
		e.preventDefault();
		navigate(`${ROUTE_CONSTANTS.EDIT_STAFF}${params.staffId}`);
	};

	if (loading) {
		return <IBPageLoader />;
	}

	if (data) {
		return (
			<div className="staffProfile">
				<h1 className="staffProfileTitle">
					{`${data.getOneStaff.firstName} ${data.getOneStaff.lastName}`}
				</h1>
				<div>
					<div className="staffProfileActions">
						<div className="staffProfileActionItem">
							<button
								onClick={handleEdit}
								className="staffProfileButton"
								disabled={params.staffProfileId && false}
							>
								Edit Staff
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	} else {
        errors.message = 'This staffProfile does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default StaffProfile