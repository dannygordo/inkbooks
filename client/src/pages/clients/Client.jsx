import { useParams } from "react-router-dom";
import "./client.css";
import ClientService  from "../../services/ClientService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";
import ClientDashboard from "../../components/clientDashboard/ClientDashboard";
import ArchiveControl from "../../components/archive/ArchiveControl";
import { CLIENT_STATUS } from "../../constants";

const Client = (props) => {
	let params = useParams();
    const errors = {};
	/**
	 * Gets client by id
	 */
	const { loading, data, refetch } = ClientService.fetchClient(params.clientId);

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
			<div className="client">
				<div className="clientHeader">
					<h1 className="clientTitle">
						{`${data.getClient.firstName} ${data.getClient.lastName}`}
					</h1>
					<ArchiveControl
						kind="client"
						name={`${data.getClient.firstName} ${data.getClient.lastName}`}
						isArchived={data.getClient.status === CLIENT_STATUS.ARCHIVED}
						archiveMutation={ClientService.ARCHIVE_CLIENT_MUTATION}
						unarchiveMutation={ClientService.UNARCHIVE_CLIENT_MUTATION}
						variables={{ clientId: data.getClient.id }}
						onChanged={refetch}
					/>
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