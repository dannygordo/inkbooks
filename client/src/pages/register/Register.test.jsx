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
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import Register from "./Register";
import { AuthContext } from "../../context/auth";

// Must match Register.jsx's document exactly, or MockedProvider won't pair request with result.
const REGISTER_ACCOUNT = gql`
	mutation RegisterAccount($input: RegisterAccountInput!) {
		registerAccount(input: $input) {
			id
			email
			firstName
			lastName
			role
			userType
			accessToken
			firebaseToken
			tagColor
		}
	}
`;

const RETURNED_USER = {
	__typename: "User",
	id: "u2",
	email: "jon@example.com",
	firstName: "Jon",
	lastName: "Snow",
	role: 20,
	userType: "artist",
	accessToken: "real-jwt",
	firebaseToken: null,
	tagColor: "#8E24AA",
};

function renderRegister({ mocks = [] } = {}) {
	const contextValue = { login: vi.fn(), user: null };
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
		const contextValue = { login: vi.fn(), user: { id: "already-here" } };
		render(
			<MemoryRouter>
				<MockedProvider mocks={[]}>
					<AuthContext.Provider value={contextValue}>
						<Register />
					</AuthContext.Provider>
				</MockedProvider>
			</MemoryRouter>,
		);

		// Redirected away, so the wizard's first question never appears.
		await waitFor(() =>
			expect(screen.queryByText("I run a shop")).not.toBeInTheDocument(),
		);
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
