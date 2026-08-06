// Register.jsx - signup as a guided setup.
//
// The property worth protecting hardest is the ORDERING: the account is created in the middle of
// the wizard, not at the end. Everything after step two is optional, saved through the ordinary
// authenticated settings mutations, and skippable - so closing the tab on the rates step leaves a
// working account rather than nothing. A test that only checked "filling everything in creates an
// account" would pass just as happily against a version that creates it last, which is the version
// where abandoning loses the lot.
//
// Explicit React import - under Vitest, @vitejs/plugin-react compiles JSX with the classic runtime.
// See scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import Register, { REGISTER_ACCOUNT } from "./Register";
import { GET_CURRENT_USER } from "../../services/UserService";
import { AuthContext } from "../../context/auth";

// THE REAL DOCUMENTS, imported rather than copied. This file used to declare its own
// REGISTER_ACCOUNT with a note that it "must match Register.jsx's exactly" - a requirement nothing
// enforced. MockedProvider pairs a request with a result by comparing the printed document, so the
// day the component's selection set changed, every mock here would have stopped matching and the
// tests would have failed with a network error rather than pointing at the copy.

// A signed-up ARTIST, with the profile record attached.
//
// userInfo is the field this whole shape exists to carry. The mutation used not to select it, and
// nothing failed: it is nullable, so the server returned a valid User with no profile and the
// wizard cached that as the session. Settings then decided the account wasn't an artist and
// offered "Nothing to configure here yet for this account type" to somebody who had signed up as
// one, until they logged out and back in.
const RETURNED_USER = {
	__typename: "User",
	id: "u2",
	email: "jon@example.com",
	firstName: "Jon",
	lastName: "Snow",
	avatar: null,
	role: 20,
	userType: "artist",
	accessToken: "real-jwt",
	firebaseToken: null,
	tagColor: "#8E24AA",
	userInfo: {
		__typename: "Artist",
		id: "a2",
		firstName: "Jon",
		lastName: "Snow",
		avatar: null,
		// Null on purpose. A brand new artist has not set a rate yet, and the server used to infer
		// "this is an Artist" from this very field being truthy - so null here is the case that
		// used to resolve as a Client and make the fragment above match nothing.
		hourlyRate: null,
		shop: null,
	},
};

// What finish() reads back before leaving. Same user, with whatever the later steps changed - here
// the rate, which is the visible proof the refetch happened rather than the cached copy surviving.
const REFRESHED_USER = {
	...RETURNED_USER,
	userInfo: { ...RETURNED_USER.userInfo, hourlyRate: 150 },
};
// getUser returns the stored document; the tokens live only on the login/signup response.
delete REFRESHED_USER.accessToken;
delete REFRESHED_USER.firebaseToken;

const refreshMock = () => ({
	request: { query: GET_CURRENT_USER, variables: { userId: "u2" } },
	result: { data: { getUser: REFRESHED_USER } },
});

function renderRegister({ mocks = [] } = {}) {
	const contextValue = { login: vi.fn(), updateCurrentUser: vi.fn(), user: null };
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<Register />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return contextValue;
}

const artistSignupMock = (overrides = {}) => ({
	request: {
		query: REGISTER_ACCOUNT,
		variables: {
			input: {
				accountType: "artist",
				firstName: "Jon",
				lastName: "Snow",
				email: "jon@example.com",
				password: "longenoughpassword",
				confirmPassword: "longenoughpassword",
				// Auto-suggested from the name. MockedProvider matches variables deeply, so its
				// presence here is a real assertion about what the form sends.
				bookingSlug: "jon-snow",
				...overrides,
			},
		},
	},
	result: { data: { registerAccount: RETURNED_USER } },
});

async function chooseArtist(user) {
	await user.click(screen.getByText("I'm an independent artist"));
}

async function fillAccountStep(user) {
	await user.type(screen.getByLabelText(/first name/i), "Jon");
	await user.type(screen.getByLabelText(/last name/i), "Snow");
	await user.type(screen.getByLabelText(/^email$/i), "jon@example.com");
	await user.type(screen.getByLabelText(/^password$/i), "longenoughpassword");
	await user.type(screen.getByLabelText(/confirm password/i), "longenoughpassword");
}

describe("Register wizard", () => {
	it("asks what kind of account first, before anything else", () => {
		renderRegister();

		expect(screen.getByText("I run a shop")).toBeInTheDocument();
		expect(screen.getByText("I'm an independent artist")).toBeInTheDocument();
		// No fields yet. Showing them alongside the choice invites somebody to fill them in and
		// then discover the choice changes what is being asked.
		expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
	});

	it("explains what each account type actually gets you", async () => {
		// The two options are the biggest decision on the screen and the labels alone don't settle
		// it - a solo studio owner needs to know a shop account still lets them take bookings.
		renderRegister();

		expect(screen.getByText(/take your own bookings too/i)).toBeInTheDocument();
		expect(screen.getByText(/join a shop later/i)).toBeInTheDocument();
	});

	it("asks a shop for its name and an artist not to", async () => {
		const user = userEvent.setup();
		renderRegister();

		await user.click(screen.getByText("I run a shop"));
		expect(screen.getByLabelText(/shop name/i)).toBeInTheDocument();

		await user.click(screen.getByText("Back"));
		await chooseArtist(user);
		expect(screen.queryByLabelText(/shop name/i)).not.toBeInTheDocument();
	});

	it("creates the account at step two, not at the end", async () => {
		// THE test. The account exists before rates, notifications or a shop cut are asked about,
		// so abandoning the wizard leaves something usable. If this ever moves to the last step,
		// closing the tab on the rates screen would lose everything.
		const user = userEvent.setup();
		const contextValue = renderRegister({ mocks: [artistSignupMock()] });

		await chooseArtist(user);
		await fillAccountStep(user);
		await user.click(screen.getByText("Create account"));

		await waitFor(() => expect(contextValue.login).toHaveBeenCalledWith(RETURNED_USER));
		// And the wizard keeps going rather than navigating away.
		expect(await screen.findByText(/how should we reach you/i)).toBeInTheDocument();
	});

	it("puts the profile record into the session, not just the login scalars", async () => {
		// THE bug this pair of tests exists for. Signup returned a User with no userInfo - valid,
		// nullable, silent - so the account that reached the dashboard looked to Settings like one
		// with no artist profile, and the only cure was logging out and back in, because login was
		// the one document that asked for the field.
		//
		// Asserted on what goes INTO auth context rather than on anything rendered, because the
		// cached session is the thing that was wrong: every screen that reads user.userInfo was
		// affected, and asserting through one of them would only cover that screen.
		const user = userEvent.setup();
		const contextValue = renderRegister({ mocks: [artistSignupMock()] });

		await chooseArtist(user);
		await fillAccountStep(user);
		await user.click(screen.getByText("Create account"));

		await waitFor(() => expect(contextValue.login).toHaveBeenCalled());
		const session = contextValue.login.mock.calls[0][0];
		expect(session.userInfo).toBeTruthy();
		expect(session.userInfo.id).toBe("a2");
	});

	it("re-reads the account before leaving, and keeps the token when it does", async () => {
		// Steps three to five change the account after step two cached it. Without a refresh the
		// dashboard runs on a copy of the user from before any of those settings existed, which is
		// the "log out and back in and it's fine" class of bug in general.
		//
		// The token assertion is the half that is easy to get wrong and impossible to notice in
		// review: getUser returns the stored User document, where accessToken is null. Spreading
		// the refetched user over the cached one without carrying the credential across blanks it
		// and signs somebody out at the moment they finish signing up.
		const user = userEvent.setup();
		const contextValue = renderRegister({
			mocks: [artistSignupMock(), refreshMock()],
		});

		await chooseArtist(user);
		await fillAccountStep(user);
		await user.click(screen.getByText("Create account"));
		await screen.findByText(/how should we reach you/i);
		await user.click(screen.getByText("Skip for now"));
		await screen.findByText(/your rates/i);
		await user.click(screen.getByText("Skip for now"));
		await screen.findByText(/you're set up/i);

		await user.click(screen.getByText("Go to my dashboard"));

		await waitFor(() => expect(contextValue.updateCurrentUser).toHaveBeenCalled());
		const refreshed = contextValue.updateCurrentUser.mock.calls[0][0];
		expect(refreshed.userInfo.hourlyRate).toBe(150);
		expect(refreshed.accessToken).toBe("real-jwt");
	});

	it("stays on the wizard after signing in, instead of bouncing to the dashboard", async () => {
		// THE regression. Step 2 logs the new account in so the later steps can save with
		// authenticated mutations - and the /register route used to be
		// `user?.id ? <Home/> : <Register/>`, so that login swapped the element out from under the
		// wizard and dumped somebody straight into the app. Steps 3 to 5 never rendered.
		//
		// Asserted through the STEP COUNTER rather than "some later text is present", because the
		// counter is what proves the wizard is still driving rather than that a heading happens to
		// exist somewhere.
		const user = userEvent.setup();
		renderRegister({ mocks: [artistSignupMock()] });

		await chooseArtist(user);
		await fillAccountStep(user);
		// An artist path is 5 steps: type, account, notifications, rates, done. Written out rather
		// than matched loosely, so adding a step to one path and not the other fails here instead
		// of silently shifting what "step 3" means.
		expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();

		await user.click(screen.getByText("Create account"));

		expect(await screen.findByText("Step 3 of 5")).toBeInTheDocument();
		expect(screen.getByText(/how should we reach you/i)).toBeInTheDocument();
	});

	it("sends somebody who is already signed in to the dashboard", async () => {
		// The other half of removing the route guard. A live session visiting /register should still
		// end up in the app - that redirect just has to live in the component now, decided once at
		// mount, so it cannot fire again when step 2 logs the new account in.
		//
		// Rendered inside REAL ROUTES, unlike every other test in this file. Those render <Register />
		// directly, which is fine for testing the wizard but useless here: navigate() has nothing to
		// swap to, so the component stays mounted and an assertion that the wizard disappeared can
		// never pass no matter how correct the redirect is. This mounts a destination so the
		// navigation has somewhere to land and the test observes routing rather than the absence of
		// a DOM node.
		const contextValue = { login: vi.fn(), user: { id: "already-here" } };
		render(
			<MemoryRouter initialEntries={["/register"]}>
				<MockedProvider mocks={[]}>
					<AuthContext.Provider value={contextValue}>
						<Routes>
							<Route path="/register" element={<Register />} />
							<Route path="/" element={<div>dashboard stand-in</div>} />
						</Routes>
					</AuthContext.Provider>
				</MockedProvider>
			</MemoryRouter>,
		);

		expect(await screen.findByText("dashboard stand-in")).toBeInTheDocument();
		expect(screen.queryByText("I run a shop")).not.toBeInTheDocument();
	});

	it("never lets the browser prefill a saved password", async () => {
		// Both password boxes are autoComplete="new-password". Without it Chrome and Safari treat
		// any type="password" field as a login box and fill in the credential they have stored for
		// this origin - so a signup form arrives with a password nobody on this screen chose.
		const user = userEvent.setup();
		renderRegister();

		await chooseArtist(user);

		expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
			"autocomplete",
			"new-password",
		);
		expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute(
			"autocomplete",
			"new-password",
		);
	});

	it("lets every step after the account be skipped", async () => {
		// An onboarding wizard that traps somebody on a number they haven't decided yet is one they
		// close. Skipping is offered explicitly, not hidden behind a back button.
		const user = userEvent.setup();
		renderRegister({ mocks: [artistSignupMock()] });

		await chooseArtist(user);
		await fillAccountStep(user);
		await user.click(screen.getByText("Create account"));
		await screen.findByText(/how should we reach you/i);

		await user.click(screen.getByText("Skip for now"));
		expect(await screen.findByText(/your rates/i)).toBeInTheDocument();

		await user.click(screen.getByText("Skip for now"));
		expect(await screen.findByText(/you're set up/i)).toBeInTheDocument();
	});

	it("offers no skip before the account exists", async () => {
		// There would be nothing to skip TO - the fields on this step are the ones an account
		// cannot be created without.
		const user = userEvent.setup();
		renderRegister();

		await chooseArtist(user);
		expect(screen.queryByText("Skip for now")).not.toBeInTheDocument();
	});

	it("gives a shop an extra step an artist never sees", async () => {
		// The step count has to reflect the path taken. The shop-cut step isn't in the list at all
		// for an artist, rather than present-and-skipped, which is how step counters go wrong.
		const user = userEvent.setup();
		renderRegister();

		await user.click(screen.getByText("I run a shop"));
		const shopSteps = screen.getByText(/step 2 of (\d+)/i).textContent;

		await user.click(screen.getByText("Back"));
		await chooseArtist(user);
		const artistSteps = screen.getByText(/step 2 of (\d+)/i).textContent;

		expect(shopSteps).not.toBe(artistSteps);
	});

	it("explains each setting rather than just labelling it", async () => {
		// The substance of this screen. Somebody is making decisions about a tool they have used
		// for ninety seconds; a bare label like "Shop cut" is not a question anyone can answer.
		const user = userEvent.setup();
		renderRegister({ mocks: [artistSignupMock()] });

		await chooseArtist(user);
		await fillAccountStep(user);
		await user.click(screen.getByText("Create account"));
		await screen.findByText(/how should we reach you/i);

		expect(screen.getByText(/a deposit taken, a session charged/i)).toBeInTheDocument();
		expect(screen.getByText(/used for your daily summary email/i)).toBeInTheDocument();
	});

	it("shows the server's field errors instead of failing silently", async () => {
		const user = userEvent.setup();
		const graphQLError = new Error("Email is already taken");
		graphQLError.extensions = {
			errors: { email: "An account already exists for that email address." },
		};
		const mocks = [
			{
				request: artistSignupMock().request,
				result: { errors: [graphQLError] },
			},
		];
		renderRegister({ mocks });

		await chooseArtist(user);
		await fillAccountStep(user);
		await user.click(screen.getByText("Create account"));

		// ONCE, not twice. The message is the email field's helperText; the summary box below the
		// fields must not repeat it. It did, and the same sentence appearing in two places reads as
		// two separate problems - which is also how this test caught it.
		const shown = await screen.findAllByText(
			"An account already exists for that email address.",
		);
		expect(shown).toHaveLength(1);
	});

	it("still surfaces an error that belongs to no field", async () => {
		// The other half of the same rule. Suppressing duplicates must not suppress a message the
		// fields aren't showing - an invisible error is a dead button, which is strictly worse than
		// an untidy one.
		const user = userEvent.setup();
		const mocks = [
			{
				request: artistSignupMock().request,
				result: { errors: [new Error("Something went wrong upstream")] },
			},
		];
		renderRegister({ mocks });

		await chooseArtist(user);
		await fillAccountStep(user);
		await user.click(screen.getByText("Create account"));

		expect(await screen.findByText(/something went wrong upstream/i)).toBeInTheDocument();
	});
});
