import React, { useContext } from "react";
import { AuthContext } from "../../../context/auth";
import { ROLES } from "../../../constants";
import { Tooltip } from "@material-ui/core";
import { Edit } from "@mui/icons-material";
import { Link } from "react-router-dom";

const IBCardActions = (props) => {
	const { user } = useContext(AuthContext);
	const { cardData } = props;
	if (user && user.role <= ROLES.STAFF) {
		return (
			<Tooltip
				placement="top-end"
				title={"Edit " + cardData.firstName + " " + cardData.lastName}
				arrow
			>
				<Link
					to={`/${cardData.__typename.toLowerCase()}/${cardData.id}`}
					className="ibCardActionsEditLink"
				>
					<Edit className="ibCardActionsIcon" />
				</Link>
			</Tooltip>
		);
	}
	return <div>IBCardActions</div>;
};

export default IBCardActions;
