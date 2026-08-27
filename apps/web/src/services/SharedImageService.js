import { gql, useQuery, useMutation } from "@apollo/client";

/**
 * The client-dashboard shared-images triage list - see server/models/SharedImage.js and
 * server/graphql/resolvers/sharedImages.js. Field selection mirrors IBImagesList.jsx's own
 * expectations (userInfo.firstName/lastName/avatar, tags, createdAt, url) exactly, so a
 * getSharedImagesForClient result can be handed to that component with no reshaping.
 */
const SHARED_IMAGE_FIELDS = `
	id
	url
	clientId
	artistId
	senderId
	userInfo {
		firstName
		lastName
		avatar
	}
	tags
	assignedProjectId
	assignedImageType
	assignedProject {
		id
		title
	}
	assignedAt
	createdAt
	updatedAt
`;

const GET_SHARED_IMAGES_FOR_CLIENT = gql`
	query GetSharedImagesForClient($clientId: ID!) {
		getSharedImagesForClient(clientId: $clientId) {
			${SHARED_IMAGE_FIELDS}
		}
	}
`;

const GET_PROJECTS_FOR_CLIENT = gql`
	query GetProjectsForClient($clientId: ID!) {
		getProjectsForClient(clientId: $clientId) {
			id
			title
			status
		}
	}
`;

const ASSIGN_SHARED_IMAGE_TO_PROJECT = gql`
	mutation AssignSharedImageToProject($sharedImageId: ID!, $projectId: ID!, $imageType: String!) {
		assignSharedImageToProject(
			sharedImageId: $sharedImageId
			projectId: $projectId
			imageType: $imageType
		) {
			${SHARED_IMAGE_FIELDS}
		}
	}
`;

const UPDATE_SHARED_IMAGE_TAGS = gql`
	mutation UpdateSharedImageTags($sharedImageId: ID!, $tags: [String!]!) {
		updateSharedImageTags(sharedImageId: $sharedImageId, tags: $tags) {
			${SHARED_IMAGE_FIELDS}
		}
	}
`;

const REMOVE_SHARED_IMAGE_FROM_LIST = gql`
	mutation RemoveSharedImageFromList($sharedImageId: ID!) {
		removeSharedImageFromList(sharedImageId: $sharedImageId)
	}
`;

const getSharedImagesForClient = (clientId, options = {}) =>
	useQuery(GET_SHARED_IMAGES_FOR_CLIENT, {
		variables: { clientId },
		skip: !clientId,
		fetchPolicy: "cache-and-network",
		...options,
	});

const getProjectsForClient = (clientId, options = {}) =>
	useQuery(GET_PROJECTS_FOR_CLIENT, {
		variables: { clientId },
		skip: !clientId,
		fetchPolicy: "cache-and-network",
		...options,
	});

const useAssignSharedImageToProject = () =>
	useMutation(ASSIGN_SHARED_IMAGE_TO_PROJECT);

const useUpdateSharedImageTags = () => useMutation(UPDATE_SHARED_IMAGE_TAGS);

const useRemoveSharedImageFromList = () =>
	// The list still shows every OTHER shared image for this client immediately after one is
	// removed - refetching the whole list on every single-row removal would be a network round
	// trip for something Apollo's own cache eviction (see SharedImagesPanel.jsx's `update`) can
	// do for free.
	useMutation(REMOVE_SHARED_IMAGE_FROM_LIST);

export default {
	GET_SHARED_IMAGES_FOR_CLIENT,
	GET_PROJECTS_FOR_CLIENT,
	ASSIGN_SHARED_IMAGE_TO_PROJECT,
	UPDATE_SHARED_IMAGE_TAGS,
	REMOVE_SHARED_IMAGE_FROM_LIST,
	getSharedImagesForClient,
	getProjectsForClient,
	useAssignSharedImageToProject,
	useUpdateSharedImageTags,
	useRemoveSharedImageFromList,
};
