import { useMutation } from "@apollo/client";
import { ImageList } from "@mui/material";
import React, { useState } from "react";
import ProjectService from "../../../../services/ProjectService";
import IBProgressItemProject from "./IBProgressItemProject";

const IBProgressListProject = ({ files, project, title }) => {
	const [urlList, setUrlList] = useState([]);
	const [updateProject] = useMutation(ProjectService.updateProject());
	let updatedReferenceImages = project.referenceImages.map(
		({ __typename, userInfo, ...keepAttrs }) => keepAttrs
	);
	let updatedDesignImages = project.designImages.map(
		({ __typename, userInfo, ...keepAttrs }) => keepAttrs
	);

	const handleProjectUpdate = () => {
		//this pulls the destructured properties off of the project object that cannot be updated by Graphql and assigns the remaining properties to ...prj
		const { __typename, artist, client, conversation, ...prj } = project;

		switch (title) {
			case "References":
				const newReferences = prj.referenceImages.map(
					({ __typename, userInfo, ...keepAttrs }) => keepAttrs
				);
				updatedReferenceImages = [...newReferences, ...urlList];
				break;
			case "Design":
				const newDesigns = prj.designImages.map(
					({ __typename, userInfo, ...keepAttrs }) => keepAttrs
				);
				updatedDesignImages = [...newDesigns, ...urlList];
				break;
		}

		const notesToSave = prj.notes.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);

		//merges the new list of images with the old one and updates Mongo
		//let updatedReferenceImages = updatedImages;
		updateProject({
			variables: {
				project: {
					...prj,
					referenceImages: updatedReferenceImages,
					designImages: updatedDesignImages,
					notes: [...notesToSave],
				},
			},
		});
		setUrlList([]);
	};
	return (
		<ImageList rowHeight={200} cols={4}>
			{files.map((file, index) => {
				return (
					<IBProgressItemProject
						file={file}
						key={index}
						project={project}
						title={title}
						setUrlList={setUrlList}
					/>
				);
			})}
			{/* If the urlList array is the same length as the files array, then all images have 
			been uploaded and it's safe to call handleProjectUpdate
			*/}
			{urlList.length > 0 &&
				urlList.length === files.length &&
				handleProjectUpdate()}
		</ImageList>
	);
};

export default IBProgressListProject;
