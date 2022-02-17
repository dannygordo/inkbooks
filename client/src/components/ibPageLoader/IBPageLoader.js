import { CircularProgress } from '@mui/material'
import React from 'react'
import { APP_SETTINGS_CONSTANTS } from "../../constants";


const IBPageLoader = () => {
  return (
    <CircularProgress>
        {APP_SETTINGS_CONSTANTS.LOADING_TEXT}
    </CircularProgress>
  )
}

export default IBPageLoader