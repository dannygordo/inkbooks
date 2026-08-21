// AccountPanel.jsx tests. Three independent cards live in this one component - Photo, Password,
// and (gated) Calendar color - see the component's own header comment on why it absorbed the old
// standalone /profile page. Most of the coverage here is the calendar-color gate and query, since
// that is where this file's own comments document two real regressions: a `.shop.id` crash for a
// shop-less user, and a permanent spinner from gating on `availableTags` instead of `loading`.
//
// Password change itself (IBUpdatePassword) and the crop/upload flow (CropEasy, Firebase Storage)
// are exercised by their own tests - IBUpdatePassword is rendered here unmodified, and the crop
// flow is not entered by any test in this file (it needs an actual File plus react-easy-crop's
// canvas cropping, which is out of scope for a component test). The Photo card is covered here only
// for the plain "submit with no new photo chosen" path.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { gql } from "@apollo/client";
import AccountPanel from "./AccountPanel";
import { AuthContext } from "../../context/auth";
import UserService from "../../services/UserService";
import { APP_SETTINGS_CONSTANTS } from "../../constants";

// UserService.getTagColorsByShop builds its gql document INSIDE the hook function
// (_FETCH_TAG_COLORS_BY_SHOP) and never exports it - there is no `UserService.FETCH_TAG_COLORS`
// to import. Reconstructed here verbatim from UserService.js. MockedProvider matches a mock to a
// call by the query's parsed shape and variables, not object identity, so a same-shape document
// written here targets the same operation - if UserService.js's selection set ever drifts from
// this copy, the affected tests fail loudly with Apollo's "no matching mock" error rather than
// passing on stale data.
const GET_USER_TAG_COLORS = gql`
	query GetUserTagColors($shopId: ID!) {
		getUserTagColors(shopId: $shopId) {
			tagColor
		}
	}
`;

function tagColorsMock(shopId, usedTags) {
	return {
		request: { query: GET_USER_TAG_COLORS, variables: { shopId } },
		result: {
			data: {
				getUserTagColors: usedTags.map((t) => ({ __typename: "TagColor", ...t })),
			},
		},
	};
}

const DEEP_BLUE = APP_SETTINGS_CONSTANTS.TAG_COLORS.find((t) => t.label === "Deep Blue");
const BRICK_RED = APP_SETTINGS_CONSTANTS.TAG_COLORS.find((t) => t.label === "Brick Red");
const GOLDFINGER = APP_SETTINGS_CONSTANTS.TAG_COLORS.find((t) => t.label === "Goldfinger");

const INDEPENDENT_ARTIST = {
	id: "artist-1",
	email: "renee@example.com",
	firstName: "Renee",
	lastName: "Wolf",
	avatar: "https://example.com/renee.jpg",
	role: 20,
	userType: "artist",
	tagColor: DEEP_BLUE.value,
	userInfo: null,
};

const SHOP_ARTIST = {
	id: "artist-2",
	email: "jamie@example.com",
	firstName: "Jamie",
	lastName: "Lee",
	avatar: null,
	role: 20,
	userType: "artist",
	tagColor: DEEP_BLUE.value,
	userInfo: { shop: { id: "shop-1" } },
};

const CLIENT_USER = {
	id: "client-1",
	email: "sam@example.com",
	firstName: "Sam",
	lastName: "Rivera",
	avatar: null,
	role: 30,
	userType: "client",
	tagColor: null,
	userInfo: {},
};

function renderPanel({
	user,
	mocks = [],
	setAlert = vi.fn(),
	setLoading = vi.fn(),
	updateCurrentUser = vi.fn(),
} = {}) {
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={{ user, setAlert, setLoading, updateCurrentUser }}>
					<AccountPanel />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { setAlert, setLoading, updateCurrentUser };
}

describe("Photo", () => {
	it("shows the user's name as the avatar label and an upload button", () => {
		renderPanel({ user: INDEPENDENT_ARTIST });

		expect(screen.getByText("Photo")).toBeInTheDocument();
		const avatarImg = screen.getByRole("img", { name: "Renee Wolf" });
		expect(avatarImg).toHaveAttribute("src", "https://example.com/renee.jpg");
		expect(screen.getByRole("button", { name: "Upload Pic" })).toBeInTheDocument();
	});

	it("submitting with no new photo chosen sends an empty avatar and alerts success", async () => {
		const user = userEvent.setup();
		const updateAvatarMock = {
			request: {
				query: UserService.UPDATE_USER_MUTATION,
				variables: {
					user: {
						id: INDEPENDENT_ARTIST.id,
						email: INDEPENDENT_ARTIST.email,
						firstName: INDEPENDENT_ARTIST.firstName,
						lastName: INDEPENDENT_ARTIST.lastName,
						avatar: "",
						role: INDEPENDENT_ARTIST.role,
					},
				},
			},
			result: {
				data: {
					updateUser: {
						__typename: "User",
						id: INDEPENDENT_ARTIST.id,
						email: INDEPENDENT_ARTIST.email,
						firstName: INDEPENDENT_ARTIST.firstName,
						lastName: INDEPENDENT_ARTIST.lastName,
						avatar: "",
						role: INDEPENDENT_ARTIST.role,
						accessToken: "token",
						userType: "artist",
						tagColor: INDEPENDENT_ARTIST.tagColor,
						themePreference: null,
						userInfo: null,
					},
				},
			},
		};
		const { setAlert, updateCurrentUser } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [updateAvatarMock],
		});

		await user.click(screen.getByRole("button", { name: "Upload Pic" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Changes have been successfully saved!!",
				}),
			),
		);
		// The mutation round-trip (fire-and-forget from handleSubmit's point of view) still lands
		// eventually - waited for here so the test doesn't finish with the update still in flight.
		await waitFor(() =>
			expect(updateCurrentUser).toHaveBeenCalledWith(
				expect.objectContaining({ avatar: "" }),
			),
		);
	});
});

describe("Password", () => {
	it("renders the change-password form", () => {
		renderPanel({ user: INDEPENDENT_ARTIST });

		expect(screen.getByRole("heading", { name: "Password" })).toBeInTheDocument();
		expect(screen.getByLabelText("Current Password")).toBeInTheDocument();
		expect(screen.getByLabelText("New Password")).toBeInTheDocument();
		expect(screen.getByLabelText("Confirm New Password")).toBeInTheDocument();
	});
});

describe("Calendar color - visibility", () => {
	it("is hidden entirely for a client (nothing shows on a calendar for them)", () => {
		renderPanel({ user: CLIENT_USER });

		expect(screen.queryByText("Calendar color")).not.toBeInTheDocument();
	});

	// Regression test: the section used to gate on `availableTags` being truthy, which for a
	// shop-less artist (the query is always skipped) meant it never populated - the picker sat on
	// an empty state forever. It must show the full, ungated palette instead, and it must not even
	// attempt the shop-scoped query (no mocks supplied - MockedProvider would surface an
	// unmatched-request error if AccountPanel tried anyway).
	it("shows the full palette for an independent artist with no shop, firing no query", async () => {
		renderPanel({ user: INDEPENDENT_ARTIST, mocks: [] });

		expect(await screen.findByText("Calendar color")).toBeInTheDocument();
		for (const tag of APP_SETTINGS_CONSTANTS.TAG_COLORS) {
			expect(screen.getByRole("button", { name: tag.label })).toBeInTheDocument();
		}
	});
});

describe("Calendar color - shop-scoped availability", () => {
	it("excludes a color already taken by a shop-mate, but keeps the caller's own current color", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [tagColorsMock("shop-1", [{ tagColor: BRICK_RED.value }])],
		});

		await screen.findByText("Calendar color");

		// Taken by someone else at the shop - not offered.
		expect(screen.queryByRole("button", { name: BRICK_RED.label })).not.toBeInTheDocument();
		// The caller's own current color is never excluded, even though it is "in use" (by them).
		const current = await screen.findByRole("button", { name: DEEP_BLUE.label });
		expect(current).toHaveAttribute("aria-pressed", "true");
		// Anything nobody has taken remains available and unselected.
		expect(screen.getByRole("button", { name: GOLDFINGER.label })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("requests tag colors scoped to the caller's own shop id", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [tagColorsMock("shop-1", [])],
		});

		// Reaching the populated palette (rather than an Apollo "no matching mock" error) IS the
		// assertion that AccountPanel queried with variables: { shopId: "shop-1" }.
		expect(await screen.findByRole("button", { name: GOLDFINGER.label })).toBeInTheDocument();
	});

	it("picking an available color saves it and updates the signed-in user", async () => {
		const user = userEvent.setup();
		const saveColorMock = {
			request: {
				query: UserService.UPDATE_USER_MUTATION,
				variables: {
					user: {
						tagColor: GOLDFINGER.value,
						id: SHOP_ARTIST.id,
						email: SHOP_ARTIST.email,
						role: SHOP_ARTIST.role,
					},
				},
			},
			result: {
				data: {
					updateUser: {
						__typename: "User",
						id: SHOP_ARTIST.id,
						email: SHOP_ARTIST.email,
						firstName: SHOP_ARTIST.firstName,
						lastName: SHOP_ARTIST.lastName,
						avatar: null,
						role: SHOP_ARTIST.role,
						accessToken: "token",
						userType: "artist",
						tagColor: GOLDFINGER.value,
						themePreference: null,
						userInfo: null,
					},
				},
			},
		};
		const { updateCurrentUser } = renderPanel({
			user: SHOP_ARTIST,
			mocks: [tagColorsMock("shop-1", [{ tagColor: BRICK_RED.value }]), saveColorMock],
		});

		await screen.findByText("Calendar color");
		await user.click(screen.getByRole("button", { name: GOLDFINGER.label }));

		await waitFor(() =>
			expect(updateCurrentUser).toHaveBeenCalledWith(
				expect.objectContaining({ tagColor: GOLDFINGER.value }),
			),
		);
	});
});
