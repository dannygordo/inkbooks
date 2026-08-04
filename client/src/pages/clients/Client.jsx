import { useParams, useNavigate } from "react-router-dom";
import "./client.css";
import ClientService  from "../../services/ClientService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";
import ClientDashboard from "../../components/clientDashboard/ClientDashboard";

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
				{/* Was a name and an Edit button and nothing else. Same component a client sees
				    for themselves on Home.jsx, scoped differently - isSelf=false, so the
				    shop-side notes section renders here and not there. */}
				<ClientDashboard clientId={params.clientId} isSelf={false} />
			</div>
		);
	} else {
        errors.message = 'This client does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default Client