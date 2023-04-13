import React, { useContext} from 'react';
import { AuthContext } from '../../../context/auth';
import { APP_SETTINGS_CONSTANTS } from '../../../constants';
//import './ibCardHeader.css';

const IBCardHeader = (props) => {
    const { user } = useContext(AuthContext);
    const { cardData } = props;
    switch(props.cardType) {
      case 'project':
        return (
          <div className="ibCardTop">
              <img src={cardData.avatar  || APP_SETTINGS_CONSTANTS.NO_IMAGE_URL} alt="" className="ibCardImage"/>
              <div className="ibCardTopTitle">
                  <span className="ibCardName">{cardData.title}</span>
                  <span className="ibCardTitle">
                    {
                      cardData.description.length > 50 ? 
                      `${cardData.description.substring(0, 50)}...`: 
                      cardData.description
                    }
                  </span>
              </div>
          </div>
        )
        case 'shop':
        return (
          <div className="ibCardTop">
              <img src={cardData.logo  || APP_SETTINGS_CONSTANTS.NO_IMAGE_URL} alt="" className="ibCardImage"/>
              <div className="ibCardTopTitle">
                  <span className="ibCardName">{cardData.name}</span>
                  <span className="ibCardTitle">
                    { cardData.website }
                  </span>
              </div>
          </div>
        )
      default:
        return (
          <div className="ibCardTop">
              <img src={cardData.user.avatar  || APP_SETTINGS_CONSTANTS.NO_IMAGE_URL} alt="" className="ibCardImage"/>
              <div className="ibCardTopTitle">
                  <span className="ibCardName">{cardData.firstName + ' ' + cardData.lastName}</span>
                  <span className="ibCardTitle">{cardData.title}</span>
              </div>
          </div>
        )
    }
  
}

export default IBCardHeader