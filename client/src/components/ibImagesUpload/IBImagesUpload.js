import React, { useState } from 'react'
import IBImagesUploadForm from './IBImagesUploadForm'
import IBProgressList from './ibProgressList/IBProgressList'

const IBImagesUpload = (props) => {
    const [files, setFiles] = useState([]);

    return (
        <div>
            <IBImagesUploadForm setFiles={setFiles}  title={props.title} />
            <IBProgressList files={files} project={props.project} title={props.title} />
        </div>
    )
}

export default IBImagesUpload