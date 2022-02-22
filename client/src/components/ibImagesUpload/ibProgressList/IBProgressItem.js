import { CheckCircleOutline } from "@mui/icons-material";
import { Box, ImageListItem } from "@mui/material";
import React, { useEffect, useState, useContext } from "react";
import IBUploadFileWithProgress from "../../../firebase/IBUploadFileWithProgress";
import IBCircularProgressWithLabel from "./IBCircularProgressWithLabel";
import { AuthContext } from "../../../context/auth";
import UtilsService from "../../../services/UtilsService";
import { useMutation } from "@apollo/client";
import ProjectService from "../../../services/ProjectService";

const IBProgressItem = ({ file, project, title, setUrlList }) => {
	const [progress, setProgress] = useState(100);
	const [imageUrl, setImageUrl] = useState(null);
	const { user } = useContext(AuthContext);

	useEffect(() => {
		const uploadImage = async () => {
			const imageName = `${user.id}.${Date.now()}.${file.name
				.split(".")
				.pop()}`;

            const imgPath = `${project.artist.shop.name}/${project.artist.firstName}_${project.artist.lastName}/${project.client.firstName}_${project.client.lastName}/${project.title}/${title}`;
			try {
				const url = await IBUploadFileWithProgress(
					file,
					UtilsService.formatImagePathForFirebaseStorage( imgPath ), imageName, setProgress );
                setUrlList(prevState => [...prevState, url]);
				setImageUrl(null);
			} catch (err) {
				alert(err.message);
				console.log(err);
			}
		};
		setImageUrl(URL.createObjectURL(file));
		uploadImage();
	}, [file]);
	const backDrop = {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: "rgba(0, 0, 0, .5)",
	};

	return (
		imageUrl && (
			<ImageListItem cols={1} rows={1}>
				<img src={imageUrl} alt="gallery" loading="lazy" />
				<Box sx={backDrop}>
					{progress < 100 ? (
						<IBCircularProgressWithLabel value={progress} />
					) : (
						<CheckCircleOutline
							sx={{ width: 60, height: 60, color: "lightgreen" }}
						/>
					)}
				</Box>
			</ImageListItem>
		)
	);
};

export default IBProgressItem;
