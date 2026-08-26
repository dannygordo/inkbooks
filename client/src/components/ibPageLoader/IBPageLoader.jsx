import { CircularProgress } from '@mui/material'
import React from 'react'
import { APP_SETTINGS_CONSTANTS } from "../../constants";
import './ibPageLoader.css';


const IBPageLoader = () => {
  return (
    <div className="ibPageLoader">
        <div className="ibPageLoaderContainer">
        {/* CircularProgress renders a self-contained SVG spinner and silently ignores any
            children passed to it - LOADING_TEXT was never actually reaching the screen this
            way. Rendered as a real sibling element instead so it's visible (and queryable). */}
        <CircularProgress />
        <span className="ibPageLoaderText">{APP_SETTINGS_CONSTANTS.LOADING_TEXT}</span>
        </div>
    </div>
  )
}

export default IBPageLoader