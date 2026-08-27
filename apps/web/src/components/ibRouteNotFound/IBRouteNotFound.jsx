import React from 'react'
import { APP_SETTINGS_CONSTANTS } from '../../constants';
import { useNavigate } from 'react-router-dom';
import './ibRouteNotFound.css';

const IBRouteNotFound = (props) => {
    const navigate = useNavigate();
  return (
    <div className="ibRouteNotFound">
        <div className="ibRouteNotFoundContainer">
            <div
                className="ibRouteNotFoundCard"
                onClick={(e) =>
                    navigate(-1)
                }
				>
                <div className="ibCardBottom">
                    <div className="ibCardInfoContainer">
                        <span className="ibCardInfoTitle">{ APP_SETTINGS_CONSTANTS.ROUTE_NOT_FOUND_TEXT }</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
  )
}
export default IBRouteNotFound