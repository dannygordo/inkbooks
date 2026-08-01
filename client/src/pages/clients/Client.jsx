import { useParams, useNavigate } from "react-router-dom";
import "./client.css";
import ClientService  from "../../services/ClientService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";

const Client = (props) => {
	const navigate = useNavigate();
	let params = useParams();
    const errors = {};
	/**
	 * Gets client by id
	 */
	const { loading, data } = ClientService.fetchClient(params.clientId);

	/**
	 * Handles the edit click event
	 */
	const handleEdit = (e) => {
		e.preventDefault();
		navigate(`${ROUTE_CONSTANTS.EDIT_CLIENT}${params.clientId}`);
	};

	if (loading) {
		return <IBPageLoader />;
	}

	if (data) {
		return (
			<div className="client">
				<h1 className="clientTitle">
					{`${data.getClient.firstName} ${data.getClient.lastName}`}
				</h1>
				<div>
					<div className="clientActions">
						<div className="clientActionItem">
							<button
								onClick={handleEdit}
								className="clientButton"
								disabled={params.clientId && false}
							>
								Edit Client
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	} else {
        errors.message = 'This client does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default Client