import { gql, useQuery } from "@apollo/client";

const ProjectService = (() => {
	const _FETCH_PROJECT_QUERY = gql`
		query ($projectId: ID!) {
			getProject(projectId: $projectId) {
				id
				title
				description
				placement
				size
				palette
				artistId
				artist {
					firstName
					lastName
					email
					id
					user {
						id
					}
					shop {
						id
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
				conversation {
					id
					members
					membersInfo {
						id
						firstName
						lastName
						avatar
						username
					}
					messages {
						id
						conversationId
						senderId
						user {
							firstName
							lastName
							avatar
						}
						message
						createdAt
						updatedAt
					}
					createdAt
					updatedAt
				}
				referenceImages {
					id
					url
					avatar
					title
					uploadedByDisplayName
					userId
					userInfo {
						firstName
						lastName
						avatar
						id
					}
					tags
					updatedAt
					createdAt
				}
				bodyImages
				designImages {
					id
					url
					avatar
					uploadedByDisplayName
					userId
					userInfo {
						firstName
						lastName
						avatar
						id
					}
					updatedAt
					createdAt
				}
				materialsUsed
				notes {
					id
					author
					note
					createdAt
					updatedAt
				}
				tags
				status
				depositAmount
			}
		}
	`;
	const _fetchProject = (projectId, setActiveMessages) => {
		return useQuery(_FETCH_PROJECT_QUERY, {
			variables: {
				projectId,
			},
			onCompleted: (data) => {
				setActiveMessages(data.getProject.conversation.messages);
			},
		});
	};
	const _FETCH_PROJECTS_BY_ARTIST_QUERY = gql`
		query GetProjectsByArtist($artistId: ID!) {
			getProjectsByArtist(artistId: $artistId) {
				id
				title
				description
				client {
					user {
						id
						firstName
						lastName
						avatar
					}
				}
				artist {
					user {
						id
						firstName
						lastName
						avatar
					}
				}
			}
			}
	`;
	const _fetchProjectsByArtist = (artistId) => {
		return useQuery(_FETCH_PROJECTS_BY_ARTIST_QUERY, {
			variables: {
				artistId,
			},
			onCompleted: (data) => {
				// setActiveMessages(data.getProject.conversation.messages);
			},
		});
	}

	const _fetchProjects = () => {
		const FETCH_PROJECTS_QUERY = gql`
			{
				getProjects {
					id
					title
					description
					placement
					size
					palette
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
					designImages {
						url
						avatar
						uploadedByDisplayName
						updatedAt
						createdAt
					}
					materialsUsed
					notes {
						author
						note
						createdAt
						updatedAt
					}
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
					placement
					size
					palette
					artistId
					clientId
					referenceImages {
						id
						url
						avatar
						title
						uploadedByDisplayName
						userId
						userInfo {
							firstName
							lastName
							avatar
							id
						}
						tags
						updatedAt
						createdAt
					}
					bodyImages
					designImages {
						id
						url
						avatar
						uploadedByDisplayName
						userId
						userInfo {
							firstName
							lastName
							avatar
							id
						}
						updatedAt
						createdAt
					}
					materialsUsed
					notes {
						id
						author
						note
						createdAt
						updatedAt
					}
					tags
					status
					depositAmount
				}
			}
		`;
		return UPDATE_PROJECT_MUTATION;
	};

	const _updateProjectNotes = () => {
		const UPDATE_PROJECT_NOTES_MUTATION = gql`
			mutation ($projectId: ID!, $notes: [IBNoteInput]) {
				updateProjectNotes(projectId: $projectId, notes: $notes) {
					notes {
						author
						note
						createdAt
						updatedAt
					}
				}
			}
		`;
		return UPDATE_PROJECT_NOTES_MUTATION;
	};

	// Flat arguments, not a wrapped ProjectInput - matches the server's createProject signature
	// exactly (typeDefs.js), unlike updateProject above. No client-side createProject existed
	// before this - the only way a Project ever got made was via the server's seed script - added
	// for the appointment wizard's "Session" path (see ibCalendar/AppointmentWizard.jsx), which
	// needs to be able to create a brand-new Project inline when there isn't an existing one to
	// attach the session to yet.
	const _CREATE_PROJECT_MUTATION = gql`
		mutation (
			$title: String!
			$description: String!
			$placement: String
			$size: String
			$artistId: ID!
			$clientId: ID!
			$status: String!
		) {
			createProject(
				title: $title
				description: $description
				placement: $placement
				size: $size
				artistId: $artistId
				clientId: $clientId
				status: $status
			) {
				id
				title
			}
		}
	`;

	const _updateProjectTags = () => {
		const UPDATE_PROJECT_TAGS_MUTATION = gql`
			mutation ($projectId: ID!, $tags: [String]) {
				updateProjectTags(projectId: $projectId, tags: $tags) {
					tags
				}
			}
		`;
		return UPDATE_PROJECT_TAGS_MUTATION;
	};
	const GQL_FETCH_PROJECT_QUERY = gql`
		query ($projectId: ID!) {
			getProject(projectId: $projectId) {
				id
				title
				description
				placement
				size
				palette
				artistId
				artist {
					firstName
					lastName
					email
					id
					shop {
						id
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
					userId
					userInfo {
						firstName
						lastName
						avatar
					}
					tags
					updatedAt
					createdAt
				}
				bodyImages
				designImages {
					url
					avatar
					uploadedByDisplayName
					userId
					userInfo {
						firstName
						lastName
						avatar
					}
					updatedAt
					createdAt
				}
				materialsUsed
				notes {
					author
					note
					createdAt
					updatedAt
				}
				tags
				status
				depositAmount
			}
		}
	`;

	return {
		FETCH_PROJECT_QUERY: _FETCH_PROJECT_QUERY,
		fetchProject: _fetchProject,
		fetchProjects: _fetchProjects,
		updateProject: _updateProject,
		updateProjectNotes: _updateProjectNotes,
		updateProjectTags: _updateProjectTags,
		fetchProjectGQL: GQL_FETCH_PROJECT_QUERY,
		fetchProjectsByArtist: _fetchProjectsByArtist,
		CREATE_PROJECT_MUTATION: _CREATE_PROJECT_MUTATION
	};
})();

export default ProjectService;
