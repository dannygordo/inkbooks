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

		let updatedReferenceImages = project.referenceImages.map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);
		let updatedDesignImages = project.designImages.map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);
		let updatedBodyImages = (project.bodyImages || []).map(
			({ __typename, userInfo, ...keepAttrs }) => keepAttrs
		);

		switch (title) {
			case "References":
				updatedReferenceImages = [...updatedReferenceImages, ...urlList];
				break;
			case "Design":
				updatedDesignImages = [...updatedDesignImages, ...urlList];
				break;
			case "Finished Tattoo":
				updatedBodyImages = [...updatedBodyImages, ...urlList];
				break;
		}

		const notesToSave = project.notes.map(
			({ __typename, ...keepAttrs }) => keepAttrs
		);

		// Built explicitly from ProjectInput's own field list (typeDefs.js) rather than spreading
		// the whole fetched project (`...prj`, as this used to do). The fetched project - the
		// GraphQL Project *output* type - carries several server-resolved fields ProjectInput has
		// no matching input field for: depositCollectedCents, depositAvailableCents, deposits,
		// consultAppointment. Spreading it into the mutation variables sent those along and every
		// image upload was rejected outright with "Field X is not defined by type ProjectInput" -
		// found via a live upload attempt. Listing the valid fields by hand means a field added to
		// the fetch query later can't silently break every upload again.
		updateProject({
			variables: {
				project: {
					id: project.id,
					title: project.title,
					description: project.description,
					placement: project.placement,
					size: project.size,
					palette: project.palette,
					artistId: project.artistId,
					clientId: project.clientId,
					materialsUsed: project.materialsUsed,
					tags: project.tags,
					status: project.status,
					referenceImages: updatedReferenceImages,
					designImages: updatedDesignImages,
					bodyImages: updatedBodyImages,
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
