import { CircularProgress } from '@mui/material'
import React from 'react'
import { APP_SETTINGS_CONSTANTS } from "../../constants";


const IBPageLoader = () => {
  return (
    <div className="ibPageLoader">
        <div className="ibPageLoaderContainer">
            <div className="ibPageLoaderCard">
                <div className="ibCardBottom">
                    <div className="ibCardInfoContainer">
                      <CircularProgress>
                          {APP_SETTINGS_CONSTANTS.LOADING_TEXT}
                      </CircularProgress>
                    </div>
                </div>
            </div>
        </div>
    </div>
  )
}

export default IBPageLoader