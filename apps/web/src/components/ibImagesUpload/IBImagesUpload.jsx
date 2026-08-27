import React, { useState } from 'react'
import IBImagesUploadForm from './IBImagesUploadForm'
import IBProgressListProject from './ibProgressList/project/IBProgressListProject'

const IBImagesUpload = (props) => {
    const [files, setFiles] = useState([]);

    return (
        <div>
            <IBImagesUploadForm setFiles={setFiles}  title={props.title} label={props.label} />
            <IBProgressListProject files={files} project={props.project} title={props.title} />
        </div>
    )
}

export default IBImagesUpload