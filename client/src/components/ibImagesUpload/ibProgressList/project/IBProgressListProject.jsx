import { useMutation } from "@apollo/client";
import { ImageList } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import ProjectService from "../../../../services/ProjectService";
import IBProgressItemProject from "./IBProgressItemProject";

const IBProgressListProject = ({ files, project, title }) => {
	const [urlList, setUrlList] = useState([]);
	const [updateProject] = useMutation(ProjectService.updateProject());
	// Guards against calling updateProject more than once per completed upload batch. Previously
	// handleProjectUpdate() was invoked directly in the JSX render body - calling an async mutation
	// (a real side effect) during render violates React's "render must be pure" rule, and nothing
	// stopped it from re-firing on every re-render while the urlList/files-length condition still
	// held (e.g. a re-render triggered by the mutation's own cache write completing). Found while
	// investigating a recurring IBImagesList.jsx null-userInfo crash - not confirmed as the cause of
	// that specific report, but a real defect regardless: fixed by moving the call into a
	// useEffect, gated by this ref so it only runs once per batch.
	const hasSubmittedBatch = useRef(false);

	useEffect(() => {
		if (urlList.length === 0) {
			hasSubmittedBatch.current = false;
			return;
		}
		if (urlList.length !== files.length || hasSubmittedBatch.current) {
			return;
		}
		hasSubmittedBatch.current = true;

		//this pulls the destructured properties off of the project object that cannot be updated by Graphql and assigns the remaining properties to ...prj
		const { __typename, artist, client, conversation, ...prj } = project;

		let updatedReferenceImages = prj.referenceImages.map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);
		let updatedDesignImages = prj.designImages.map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);

		switch (title) {
			case "References":
				updatedReferenceImages = [...updatedReferenceImages, ...urlList];
				break;
			case "Design":
				updatedDesignImages = [...updatedDesignImages, ...urlList];
				break;
		}

		const notesToSave = prj.notes.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);

		//merges the new list of images with the old one and updates Mongo
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [urlList, files.length]);

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
		</ImageList>
	);
};

export default IBProgressListProject;
