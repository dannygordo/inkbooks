import "./ibCardProjectDetails.css";
import React, { useContext } from "react";
import { AuthContext } from "../../../context/auth";
import { APP_SETTINGS_CONSTANTS } from "../../../constants";
import {
	AttachMoney,
	MonitorHeart,
} from "@mui/icons-material";
import UtilsService from "../../../services/UtilsService";

const IBCardProjectDetails = (props) => {
	const { user } = useContext(AuthContext);
	const { cardData: project } = props;

	return (
		<div className="ibCardBottom">
			<span className="ibCardDetailsTitle">Project Details</span>
			<div className="ibCardInfoContainer">
			<img src={project.artist.avatar  || APP_SETTINGS_CONSTANTS.NO_IMAGE_URL} alt="" className="ibCardInfoContainerImage"/>
				<span className="ibCardInfoTitle">
					{`${project.artist.firstName} ${project.artist.lastName}`}{" "}
				</span>
			</div>
			<div className="ibCardInfoContainer">
			<img src={project.client.avatar  || APP_SETTINGS_CONSTANTS.NO_IMAGE_URL} alt="" className="ibCardInfoContainerImage"/>
				<span className="ibCardInfoTitle">
					{`${project.client.firstName} ${project.client.lastName}`}{" "}
				</span>
			</div>
			<div className="ibCardInfoContainer">
				<MonitorHeart className="ibCardIcon" />
				<span className="ibCardInfoTitle">
					{UtilsService.prettyConstantsListValue(
						APP_SETTINGS_CONSTANTS.PROJECT_STATUS,
						project.status
					)}
				</span>
			</div>
			<div className="ibCardInfoContainer">
				<AttachMoney className="ibCardIcon" />
				<span className="ibCardInfoTitle">
					${project.depositAmount}
				</span>
			</div>
		</div>
	);
};

export default IBCardProjectDetails;
