import { gql, useQuery, useMutation } from "@apollo/client";

const ProjectService = (() => {
	const _fetchProject = (projectId) => {
		const FETCH_PROJECT_QUERY = gql`
			query ($projectId: ID!) {
				getProject(projectId: $projectId) {
					id
					title
					description
					artistId
					artist {
						firstName
						lastName
						email
						id
						shop {
							name
						}
					}
					clientId
					client {
						firstName
						lastName
						email
						id
					}
					referenceImages {
						url
						avatar
						title
						uploadedByDisplayName
						tags
						updatedAt
						createdAt
					}
					bodyImages
					designImages
					materialsUsed
					notes
					tags
					status
					depositAmount
				}
			}
		`;
		return useQuery(FETCH_PROJECT_QUERY, {
			variables: {
				projectId,
			},
		});
	};

	const _fetchProjects = () => {
		const FETCH_PROJECTS_QUERY = gql`
			{
				getProjects {
					id
					title
					description
					artistId
					artist {
						firstName
						lastName
						email
						avatar
						id
					}
					clientId
					client {
						firstName
						lastName
						email
						avatar
						id
					}
					referenceImages {
						url
						avatar
						title
						uploadedByDisplayName
						tags
						updatedAt
						createdAt
					}
					bodyImages
					designImages
					materialsUsed
					notes
					tags
					status
					depositAmount
				}
			}
		`;
		return useQuery(FETCH_PROJECTS_QUERY);
	};

	const _updateProject = (project) => {
		const UPDATE_PROJECT_MUTATION = gql`
			mutation ($project: ProjectInput) {
				updateProject(project: $project) {
					id
					title
					description
					artistId
					clientId
					referenceImages {
						url
						avatar
						uploadedByDisplayName
						updatedAt
						createdAt
					}
					bodyImages
					designImages
					materialsUsed
					notes
					tags
					status
					depositAmount
				}
			}
		`;
		return UPDATE_PROJECT_MUTATION;
	};

	return {
		fetchProject: _fetchProject,
		fetchProjects: _fetchProjects,
		updateProject: _updateProject,
	};
})();

export default ProjectService;
