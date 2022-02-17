import './ibCardProjectDetails.css';
import React, { useContext} from 'react'
import { AuthContext } from '../../../context/auth'
import { APP_SETTINGS_CONSTANTS } from '../../../constants';
import {
	Palette,
	AttachMoney,
	EmojiPeople,
    MonitorHeart
} from "@mui/icons-material";

const IBCardProjectDetails = (props) => {
    const { user } = useContext(AuthContext);
    const { cardData: project } = props;

    const prettyProjectStatus = (list, projectStatus) => {
        let result = '';
        if(list && projectStatus >= 0) {
          Object.values(list).map((item) => {
              if(item.VALUE === projectStatus) {
                result = item.LABEL;
            }
          });
        }
        return result;
    }

  return (
    <div className="ibCardBottom">
        <span className="ibCardDetailsTitle">Project Details</span>
        <div className="ibCardInfoContainer">
            <Palette className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{`${project.artist.firstName} ${project.artist.lastName}`} </span>
        </div>
        <div className="ibCardInfoContainer">
            <EmojiPeople className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{`${project.client.firstName} ${project.client.lastName}`} </span>
        </div>
        <div className="ibCardInfoContainer">
            <MonitorHeart className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{prettyProjectStatus(APP_SETTINGS_CONSTANTS.PROJECT_STATUS, project.status)}</span>
        </div>
        <div className="ibCardInfoContainer">
            <AttachMoney className="ibCardIcon"/>
            <span className="ibCardInfoTitle">${project.depositAmount}</span>
        </div>
    </div>
  )
}

export default IBCardProjectDetails