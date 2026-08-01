import { CircularProgress } from '@mui/material'
import React from 'react'
import { APP_SETTINGS_CONSTANTS } from "../../constants";
import './ibPageLoader.css';


const IBPageLoader = () => {
  return (
    <div className="ibPageLoader">
        <div className="ibPageLoaderContainer">
        <CircularProgress>
            {APP_SETTINGS_CONSTANTS.LOADING_TEXT}
        </CircularProgress>
        </div>
    </div>
  )
}

export default IBPageLoader