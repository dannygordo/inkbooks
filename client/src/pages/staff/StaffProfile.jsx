import { useParams } from "react-router-dom";
import "./staffProfile.css";
import StaffService  from "../../services/StaffService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";

const StaffProfile = (props) => {
	let params = useParams();
    const errors = {};
	/**
	 * Gets staffProfile by id
	 */
	const { loading, data } = StaffService.fetchOneStaff(params.staffId);

	// The corner "Edit" button is gone from every detail page. It was a fixed action in the top
	// right of a record that didn't say what it edited or where it went, and it was the only way
	// in - so viewing and editing were two separate destinations for the same record, with a
	// round trip between them. Rows now lead straight to the record, and editing belongs beside
	// the thing being edited rather than in a corner. The edit ROUTES are untouched and still
	// reachable directly; only the corner button is removed.

	if (loading) {
		return <IBPageLoader />;
	}

	if (data) {
		return (
			<div className="staffProfile">
				<h1 className="staffProfileTitle">
					{`${data.getOneStaff.firstName} ${data.getOneStaff.lastName}`}
				</h1>
			</div>
		);
	} else {
        errors.message = 'This staffProfile does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default StaffProfile