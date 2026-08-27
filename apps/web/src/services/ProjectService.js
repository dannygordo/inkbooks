// Step 2 of the mobile-app monorepo plan (PRODUCTION_ROADMAP.md's Phase 5): the six operations
// this service exposes are no longer hand-written gql`` documents - they're generated from
// packages/api/src/operations/*.graphql by GraphQL Code Generator, run against the real server
// schema (server/graphql/typeDefs.js). Field selections, operation names, and comments explaining
// *why* a given field is selected now live in those .graphql files, not here - this file is left
// as a thin adapter that preserves ProjectService's existing public shape (every call site in
// apps/web keeps working unchanged) while delegating the actual query/mutation definitions to
// @inkbooks/api. See DECISIONS.md's X1/X2/X3 for why this package is TypeScript, why schema
// changes are additive-only, and where design tokens live - none of that is repeated here.
import {
	useGetProjectQuery,
	useGetProjectsQuery,
	useGetProjectsByArtistQuery,
	GetProjectDocument,
	GetProjectGqlDocument,
	UpdateProjectDocument,
	UpdateProjectNotesDocument,
	UpdateProjectTagsDocument,
	CreateProjectDocument,
} from "@inkbooks/api";

const ProjectService = (() => {
	const _fetchProject = (projectId, setActiveMessages) => {
		return useGetProjectQuery({
			variables: {
				projectId,
			},
			onCompleted: (data) => {
				setActiveMessages(data.getProject.conversation.messages);
			},
		});
	};

	// fetchPolicy: 'cache-and-network' - same reasoning as AppointmentService's
	// getAppointmentsByArtist (see that file's own comment): this powers ArtistPerformancePanel's
	// "Active Projects" count on the same dashboard, and converting a consult to a session creates
	// a brand-new Project via a mutation that has no reason to know this cached list query exists.
	// Left at Apollo's default 'cache-first', a dashboard visit right after that conversion could
	// just as easily show a stale count as getAppointmentsByArtist showed a stale appointment list.
	const _fetchProjectsByArtist = (artistId) => {
		return useGetProjectsByArtistQuery({
			variables: {
				artistId,
			},
			fetchPolicy: "cache-and-network",
		});
	};

	const _fetchProjects = (page) => {
		return useGetProjectsQuery({ variables: { page } });
	};

	// Ignores its own `project` argument, same as ClientService.updateClient - callers hand the
	// returned document straight to their own useMutation() and pass `project` as that mutation's
	// variables instead. Kept exactly as-is; only the document's source changed.
	const _updateProject = (project) => {
		return UpdateProjectDocument;
	};

	const _updateProjectNotes = () => {
		return UpdateProjectNotesDocument;
	};

	const _updateProjectTags = () => {
		return UpdateProjectTagsDocument;
	};

	return {
		FETCH_PROJECT_QUERY: GetProjectDocument,
		fetchProject: _fetchProject,
		fetchProjects: _fetchProjects,
		updateProject: _updateProject,
		updateProjectNotes: _updateProjectNotes,
		updateProjectTags: _updateProjectTags,
		fetchProjectGQL: GetProjectGqlDocument,
		fetchProjectsByArtist: _fetchProjectsByArtist,
		CREATE_PROJECT_MUTATION: CreateProjectDocument,
	};
})();

export default ProjectService;
