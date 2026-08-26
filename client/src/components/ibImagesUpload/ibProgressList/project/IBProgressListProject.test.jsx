// IBProgressListProject.jsx tests. IBProgressItemProject (one row per in-flight file) is mocked
// out here - it has its own dedicated test file - so these tests can focus on what THIS component
// itself owns: waiting for every file in the batch to report back through urlList, filing the
// finished images onto the right project field for the given title, building the updateProject
// mutation's variables from an explicit field list rather than spreading the fetched project, and
// only firing that mutation once per completed batch.
//
// Explicit React import - see the matching note in context/auth.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import IBProgressListProject from "./IBProgressListProject";

// Each mocked item reports its own file back to the parent's setUrlList as soon as it mounts,
// mirroring the real IBProgressItemProject's "upload finishes, call setUrlList" contract closely
// enough to drive the parent's own batch-completion effect, without dragging in the real upload
// pipeline (Firebase, bson, AuthContext) that component's own test already covers.
vi.mock("./IBProgressItemProject", () => ({
	default: ({ file, setUrlList }) => {
		React.useEffect(() => {
			setUrlList((prev) => [...prev, { id: `id-${file.name}`, url: `https://example.com/${file.name}` }]);
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);
		return <div data-testid="progress-item">{file.name}</div>;
	},
}));

const { updateProjectMock, useMutationMock } = vi.hoisted(() => ({
	updateProjectMock: vi.fn(),
	useMutationMock: vi.fn(),
}));

vi.mock("@apollo/client", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, useMutation: useMutationMock };
});

function makeFile(name) {
	return new File(["x"], name, { type: "image/png" });
}

function makeProject(overrides = {}) {
	return {
		id: "project-1",
		title: "Half sleeve",
		description: "A big one",
		placement: "arm",
		size: "large",
		palette: "black and grey",
		artistId: "artist-1",
		clientId: "client-1",
		materialsUsed: "needles",
		tags: ["sleeve"],
		status: "in_progress",
		referenceImages: [{ __typename: "IBImage", id: "ref-1", url: "ref1.png", userInfo: { firstName: "Jon" } }],
		designImages: [{ __typename: "IBImage", id: "des-1", url: "des1.png", userInfo: { firstName: "Jon" } }],
		bodyImages: [{ __typename: "IBImage", id: "body-1", url: "body1.png", userInfo: { firstName: "Jon" } }],
		notes: [{ __typename: "Note", id: "note-1", author: "Jon", note: "hi" }],
		// Server-resolved fields that exist on the fetched Project but have no matching field on
		// ProjectInput - must NOT be forwarded to the mutation (see the component's own comment on
		// why this list is built by hand rather than spread from `project`).
		depositCollectedCents: 5000,
		depositAvailableCents: 5000,
		deposits: [{ id: "dep-1" }],
		consultAppointment: { id: "appt-1" },
		...overrides,
	};
}

describe("IBProgressListProject", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updateProjectMock.mockResolvedValue({});
		useMutationMock.mockReturnValue([updateProjectMock]);
	});

	it("renders one progress item per file", () => {
		const { getAllByTestId } = render(
			<IBProgressListProject
				files={[makeFile("a.png"), makeFile("b.png")]}
				project={makeProject()}
				title="References"
			/>,
		);

		expect(getAllByTestId("progress-item")).toHaveLength(2);
	});

	it("does not call updateProject until every file in the batch has reported back", async () => {
		render(
			<IBProgressListProject files={[makeFile("a.png"), makeFile("b.png")]} project={makeProject()} title="References" />,
		);

		// Both mocked items fire on mount, so by the time this settles the batch IS complete -
		// this asserts the guard doesn't fire per-item, only once the full batch is in.
		await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));
	});

	it("appends newly uploaded images to referenceImages when title is References, leaving other lists untouched", async () => {
		const project = makeProject();
		render(<IBProgressListProject files={[makeFile("a.png")]} project={project} title="References" />);

		await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));
		const { variables } = updateProjectMock.mock.calls[0][0];
		expect(variables.project.referenceImages).toEqual([
			{ id: "ref-1", url: "ref1.png" },
			{ id: "id-a.png", url: "https://example.com/a.png" },
		]);
		expect(variables.project.designImages).toEqual([{ id: "des-1", url: "des1.png" }]);
		expect(variables.project.bodyImages).toEqual([{ id: "body-1", url: "body1.png" }]);
	});

	it("appends to designImages when title is Design", async () => {
		const project = makeProject();
		render(<IBProgressListProject files={[makeFile("a.png")]} project={project} title="Design" />);

		await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));
		const { variables } = updateProjectMock.mock.calls[0][0];
		expect(variables.project.designImages).toEqual([
			{ id: "des-1", url: "des1.png" },
			{ id: "id-a.png", url: "https://example.com/a.png" },
		]);
		expect(variables.project.referenceImages).toEqual([{ id: "ref-1", url: "ref1.png" }]);
	});

	it("appends to bodyImages when title is Finished Tattoo", async () => {
		const project = makeProject();
		render(<IBProgressListProject files={[makeFile("a.png")]} project={project} title="Finished Tattoo" />);

		await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));
		const { variables } = updateProjectMock.mock.calls[0][0];
		expect(variables.project.bodyImages).toEqual([
			{ id: "body-1", url: "body1.png" },
			{ id: "id-a.png", url: "https://example.com/a.png" },
		]);
	});

	it("treats a missing bodyImages field on the project as an empty list rather than crashing", async () => {
		const project = makeProject({ bodyImages: undefined });
		render(<IBProgressListProject files={[makeFile("a.png")]} project={project} title="Finished Tattoo" />);

		await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));
		const { variables } = updateProjectMock.mock.calls[0][0];
		expect(variables.project.bodyImages).toEqual([{ id: "id-a.png", url: "https://example.com/a.png" }]);
	});

	it("builds the mutation variables from an explicit field list, dropping server-only fields ProjectInput doesn't accept", async () => {
		const project = makeProject();
		render(<IBProgressListProject files={[makeFile("a.png")]} project={project} title="References" />);

		await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));
		const { variables } = updateProjectMock.mock.calls[0][0];
		expect(variables.project).toMatchObject({
			id: "project-1",
			title: "Half sleeve",
			description: "A big one",
			placement: "arm",
			size: "large",
			palette: "black and grey",
			artistId: "artist-1",
			clientId: "client-1",
			materialsUsed: "needles",
			tags: ["sleeve"],
			status: "in_progress",
		});
		expect(variables.project.notes).toEqual([{ id: "note-1", author: "Jon", note: "hi" }]);
		expect(variables.project).not.toHaveProperty("depositCollectedCents");
		expect(variables.project).not.toHaveProperty("depositAvailableCents");
		expect(variables.project).not.toHaveProperty("deposits");
		expect(variables.project).not.toHaveProperty("consultAppointment");
	});

	it("only fires the mutation once per completed batch, not again after the batch resets", async () => {
		render(<IBProgressListProject files={[makeFile("a.png")]} project={makeProject()} title="References" />);

		await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));

		// Give any leftover microtasks/effects (e.g. the urlList reset to []) a chance to run -
		// this must NOT trigger a second call.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(updateProjectMock).toHaveBeenCalledTimes(1);
	});
});
