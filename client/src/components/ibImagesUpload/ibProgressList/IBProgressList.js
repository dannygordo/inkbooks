import { useMutation } from "@apollo/client";
import { ImageList } from "@mui/material";
import React, { useState } from "react";
import ProjectService from "../../../services/ProjectService";
import IBProgressItem from "./IBProgressItem";

const IBProgressList = ({ files, project, title }) => {
	const [urlList, setUrlList] = useState([]);
	const [updateTheArtist] = useMutation(ProjectService.updateProject());
	const updateProject = () => {
		//this pulls the destructured properties off of the project object and assigns the remaining properties to ...prj
		const { __typename, artist, client, ...prj } = project;

		//merges the new list of
		let updatedReferenceImages = [...prj.referenceImages, ...urlList];
		updateTheArtist({
			variables: {
				project: {
					...prj,
					referenceImages: updatedReferenceImages,
				},
			},
		});
		setUrlList([]);
	};
	return (
		<ImageList rowHeight={200} cols={4}>
			{files.map((file, index) => {
				return (
					<IBProgressItem
						file={file}
						key={index}
						project={project}
						title={title}
						setUrlList={setUrlList}
					/>
				);
			})}
			{/* If the urlList array is the same length as the files array, then all images have 
			been uploaded and it's safe to call updateProject
			*/}
			{urlList.length > 0 &&
				urlList.length === files.length &&
				updateProject()}
		</ImageList>
	);
};

export default IBProgressList;
