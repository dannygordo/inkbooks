// SharedImageService.js tests. Unlike ClientService.js/ProjectService.js, every gql document here
// is a module-level const that is ALSO directly exported (GET_SHARED_IMAGES_FOR_CLIENT,
// GET_PROJECTS_FOR_CLIENT, ASSIGN_SHARED_IMAGE_TO_PROJECT, UPDATE_SHARED_IMAGE_TAGS,
// REMOVE_SHARED_IMAGE_FROM_LIST) - so every mock below can use the real exported document
// directly, with no hand-copied reconstruction needed anywhere in this file. The five hook
// factories (getSharedImagesForClient, getProjectsForClient, useAssignSharedImageToProject,
// useUpdateSharedImageTags, useRemoveSharedImageFromList) are thin useQuery/useMutation wrappers
// around those same documents, exercised through the same throwaway-harness pattern
// ClientService.test.js established.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling SharedImageService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation } from "@apollo/client";
import { print } from "graphql";
import SharedImageService from "./SharedImageService";

// ---- generic harnesses -----------------------------------------------------------------------

function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

function MutationHarness({ document, variables }) {
	const [result, setResult] = React.useState(null);
	const [mutate] = useMutation(document, { onCompleted: setResult });
	return React.createElement(
		"div",
		null,
		React.createElement("button", { onClick: () => mutate({ variables }) }, "go"),
		result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
	);
}

async function clickGo(user) {
	await user.click(screen.getByRole("button", { name: "go" }));
}

function sharedImage(overrides = {}) {
	return {
		__typename: "SharedImage",
		id: "img-1",
		url: "https://example.com/img-1.jpg",
		clientId: "client-1",
		artistId: "artist-1",
		senderId: "client-1",
		userInfo: { __typename: "User", firstName: "Arya", lastName: "Stark", avatar: null },
		tags: [],
		assignedProjectId: null,
		assignedImageType: null,
		assignedProject: null,
		assignedAt: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// ---- getSharedImagesForClient -----------------------------------------------------------------

describe("SharedImageService.getSharedImagesForClient", () => {
	it("resolves with the client's triage list", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => SharedImageService.getSharedImagesForClient("client-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: SharedImageService.GET_SHARED_IMAGES_FOR_CLIENT,
								variables: { clientId: "client-1" },
							},
							result: {
								data: {
									getSharedImagesForClient: [
										sharedImage({ tags: ["koi", "reference"] }),
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("img-1");
		expect(result).toHaveTextContent("koi");
	});

	// skip: !clientId - a falsy clientId must never fire a request at all.
	it("skips the query entirely when clientId is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => SharedImageService.getSharedImagesForClient(""),
			});
		}
		// Zero mocks registered: if this fired a real request it would blow up with "no matching
		// mock" and surface as an error, which the assertion below rules out.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The `options = {}` default plus `...options` spread AFTER the internal `skip: !clientId` means
	// a caller-supplied `skip` wins over the internal one - proven here by forcing skip:true despite
	// a perfectly valid clientId, which should still suppress the request.
	it("lets an explicit options.skip override the internal skip-on-falsy-id check", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => SharedImageService.getSharedImagesForClient("client-1", { skip: true }),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- getProjectsForClient ---------------------------------------------------------------------

describe("SharedImageService.getProjectsForClient", () => {
	it("resolves with the client's projects (for the assign-to-project picker)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => SharedImageService.getProjectsForClient("client-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: SharedImageService.GET_PROJECTS_FOR_CLIENT,
								variables: { clientId: "client-1" },
							},
							result: {
								data: {
									getProjectsForClient: [
										{ __typename: "Project", id: "project-1", title: "Half sleeve - koi", status: "in_progress" },
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Half sleeve - koi");
	});

	// Same skip-on-falsy-id guard as getSharedImagesForClient above.
	it("skips the query entirely when clientId is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => SharedImageService.getProjectsForClient(null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- useAssignSharedImageToProject --------------------------------------------------------------

describe("SharedImageService.useAssignSharedImageToProject", () => {
	it("assigns a shared image to a project and returns the updated image", async () => {
		const user = userEvent.setup();
		const variables = { sharedImageId: "img-1", projectId: "project-1", imageType: "reference" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: SharedImageService.ASSIGN_SHARED_IMAGE_TO_PROJECT,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SharedImageService.ASSIGN_SHARED_IMAGE_TO_PROJECT, variables },
							result: {
								data: {
									assignSharedImageToProject: sharedImage({
										assignedProjectId: "project-1",
										assignedImageType: "reference",
										assignedProject: { __typename: "Project", id: "project-1", title: "Half sleeve - koi" },
										assignedAt: "2026-08-21T00:00:00.000Z",
									}),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Half sleeve - koi");
		expect(result).toHaveTextContent("reference");
	});
});

// ---- useUpdateSharedImageTags -------------------------------------------------------------------

describe("SharedImageService.useUpdateSharedImageTags", () => {
	it("updates a shared image's tags and returns the updated image", async () => {
		const user = userEvent.setup();
		const variables = { sharedImageId: "img-1", tags: ["koi", "color"] };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: SharedImageService.UPDATE_SHARED_IMAGE_TAGS,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SharedImageService.UPDATE_SHARED_IMAGE_TAGS, variables },
							result: {
								data: {
									updateSharedImageTags: sharedImage({ tags: ["koi", "color"] }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("koi");
		expect(result).toHaveTextContent("color");
	});
});

// ---- useRemoveSharedImageFromList -----------------------------------------------------------------

describe("SharedImageService.useRemoveSharedImageFromList", () => {
	it("removes a shared image from the list and returns a bare boolean", async () => {
		const user = userEvent.setup();
		const variables = { sharedImageId: "img-1" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: SharedImageService.REMOVE_SHARED_IMAGE_FROM_LIST,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SharedImageService.REMOVE_SHARED_IMAGE_FROM_LIST, variables },
							result: { data: { removeSharedImageFromList: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("true");
	});

	// removeSharedImageFromList resolves to a bare Boolean, not an object - locks in that no one
	// has accidentally turned it into a selection set (which would be a breaking schema change) the
	// way every other mutation/query in this file returns SHARED_IMAGE_FIELDS or an object shape.
	it("has no sub-selection - it's a scalar-returning mutation", () => {
		const printed = print(SharedImageService.REMOVE_SHARED_IMAGE_FROM_LIST);
		expect(printed).toContain("removeSharedImageFromList(sharedImageId: $sharedImageId)");
		expect(printed).not.toMatch(/removeSharedImageFromList\([^)]*\)\s*\{/);
	});
});

// ---- shared SHARED_IMAGE_FIELDS consistency ------------------------------------------------------

describe("SharedImageService field selection consistency", () => {
	// GET_SHARED_IMAGES_FOR_CLIENT, ASSIGN_SHARED_IMAGE_TO_PROJECT, and UPDATE_SHARED_IMAGE_TAGS all
	// interpolate the same SHARED_IMAGE_FIELDS string per SharedImageService.js's own comment (so
	// IBImagesList.jsx can render any of their results with no reshaping) - this locks in that all
	// three actually select the same fields, rather than one silently drifting from the others.
	it("selects the same shared-image fields across the query and both mutations that return one", () => {
		const expectedFields = [
			"id",
			"url",
			"clientId",
			"artistId",
			"senderId",
			"userInfo",
			"tags",
			"assignedProjectId",
			"assignedImageType",
			"assignedProject",
			"assignedAt",
			"createdAt",
			"updatedAt",
		];

		for (const doc of [
			SharedImageService.GET_SHARED_IMAGES_FOR_CLIENT,
			SharedImageService.ASSIGN_SHARED_IMAGE_TO_PROJECT,
			SharedImageService.UPDATE_SHARED_IMAGE_TAGS,
		]) {
			const printed = print(doc);
			for (const field of expectedFields) {
				expect(printed).toContain(field);
			}
		}
	});
});
