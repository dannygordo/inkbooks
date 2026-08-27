import React, { useRef } from "react";
import { Input, Fab } from "@mui/material";
import { Add } from "@mui/icons-material";
import './ibImagesUpload.css';

const IBImagesUploadForm = ({ setFiles, label }) => {
	const fileRef = useRef();
	const handleClick = (e) => {
		e.preventDefault();
		fileRef.current.click();
	};

	const handleChange = (e) => {
		e.preventDefault();
		setFiles([...e.target.files]);
		fileRef.current.value = null;
	};

	return (
		<form className="imagesUploadContainer">
            <div className="imagesUploadTitle">
                {label}
            </div>
			<Input
                    type="file"
                    inputRef={fileRef}
                    inputProps={{ multiple: true }}
                    onChange={handleChange}
                    sx={{ display: "none" }}
                />
                <Fab className="imagesUploadButton" sx={{backgroundColor: '#333', color: '#ddd'}} aria-label="add" onClick={handleClick}>
                    <Add fontSize="medium" />
                </Fab>
		</form>
	);
};

export default IBImagesUploadForm;
