// Explicit React import - see scripts/check-react-in-tested-components.mjs. Under Vitest,
// @vitejs/plugin-react compiles JSX with the classic runtime, so anything a test renders needs
// React in scope.
import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import { gql, useMutation } from "@apollo/client";
import { ROUTE_CONSTANTS } from "../../constants";
import { AuthContext } from "../../context/auth";
import BookingSlugField from "../../components/artist/BookingSlugField";
import { suggestSlugOrBlank } from "../../utils/bookingSlug";
import "./register.css";

/**
 * Public signup: a shop, or an independent artist.
 *
 * WHAT THIS PAGE NO LONGER DOES. It used to create Clients, and it sent `role: 30` and
 * `userType: 'client'` in the mutation variables - fields the server pointedly ignored. Clients
 * aren't self-registerable now: they already get an account the moment they submit a booking
 * request, and can claim it through password reset. A client signing up cold arrived at a
 * dashboard with no artist, no project and nothing to do.
 *
 * WHY THE CHOICE COMES FIRST, BEFORE ANY FIELDS. The two paths ask for different things - a shop
 * needs a name, an artist doesn't - and a form that grows a field after you have started filling it
 * in reads as a glitch. Asking the one question that shapes the rest, first, also means everything
 * after it can be labelled for the person actually reading it.
 *
 * The account type is the ONLY thing this form says about identity. role and userType are derived
 * from it server-side, and this page never sends either - see registerAccount in
 * server/graphql/resolvers/users.js.
 */

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

const ACCOUNT_TYPES = [
	{
		value: "shop",
		title: "I run a shop",
		// Describes what the account LETS YOU DO, not what it is called. "Shop account" tells
		// somebody nothing about whether it is the right one for them; the second sentence answers
		// the question a solo studio owner is actually asking.
		blurb: "Manage artists, the shop calendar and the books. You can take bookings yourself too.",
	},
	{
		value: "artist",
		title: "I'm an independent artist",
		blurb: "Your own calendar, clients and projects. Join a shop later if you want to.",
	},
];

const Register = () => {
	const context = useContext(AuthContext);
	const navigate = useNavigate();

	const [accountType, setAccountType] = useState(null);
	const [values, setValues] = useState({
		firstName: "",
		lastName: "",
		email: "",
		password: "",
		confirmPassword: "",
		shopName: "",
		bookingSlug: "",
	});
	// Whether the person has edited the link themselves. Until they do, it tracks their name -
	// see setField below. Without this flag, typing a surname would silently overwrite a handle
	// they had already chosen, which is the worst possible moment to lose it.
	const [slugTouched, setSlugTouched] = useState(false);
	const [errors, setErrors] = useState({});

	const [registerAccount, { loading }] = useMutation(REGISTER_ACCOUNT, {
		update(_, { data: { registerAccount: userData } }) {
			context.login(userData);
			navigate(ROUTE_CONSTANTS.HOME);
		},
		onError(err) {
			// The server returns per-field errors under extensions.errors. Anything else becomes one
			// general message rather than an empty error box - a failed signup rendering as nothing
			// at all is indistinguishable from a dead button.
			const fieldErrors = err.graphQLErrors?.[0]?.extensions?.errors;
			setErrors(fieldErrors || { general: err.message });
		},
	});

	const setField = (name) => (e) => {
		const next = e.target.value;
		setValues((prev) => {
			const updated = { ...prev, [name]: next };
			// The suggestion follows the name until the person takes it over. A prefill they can see
			// and overwrite is the whole design of this field (see utils/bookingSlug.js): a handle
			// assigned silently is what the deleted username was.
			if (!slugTouched && (name === "firstName" || name === "lastName")) {
				updated.bookingSlug = suggestSlugOrBlank(updated.firstName, updated.lastName);
			}
			return updated;
		});
	};

	const setBookingSlug = (next) => {
		setSlugTouched(true);
		setValues((prev) => ({ ...prev, bookingSlug: next }));
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		setErrors({});
		registerAccount({
			variables: {
				input: {
					accountType,
					firstName: values.firstName,
					lastName: values.lastName,
					email: values.email,
					password: values.password,
					confirmPassword: values.confirmPassword,
					// Omitted entirely for an artist rather than sent blank. The server only requires
					// it for a shop, and an empty string would read as an answer that was given.
					...(accountType === "shop" ? { shopName: values.shopName } : {}),
					// Same rule: omitted when blank rather than sent as "". The server treats an
					// absent slug as "didn't choose one" and a blank string would land on the
					// unique index alongside every other slug-less artist.
					...(values.bookingSlug ? { bookingSlug: values.bookingSlug } : {}),
				},
			},
		});
	};

	return (
		<div className="register">
			<div className="registerWrapper">
				<div className="registerLeft">
					<h3 className="registerLogo">Inkbooks</h3>
					<span className="registerDesc">
						The #1 way to manage your tattoo schedule, clients, and projects
					</span>
				</div>
				<div className="registerRight">
					{!accountType ? (
						<div className="registerBox">
							<h4 className="registerStepTitle">What are you signing up as?</h4>
							{ACCOUNT_TYPES.map((option) => (
								<button
									key={option.value}
									type="button"
									className="registerTypeCard"
									onClick={() => setAccountType(option.value)}
								>
									<span className="registerTypeTitle">{option.title}</span>
									<span className="registerTypeBlurb">{option.blurb}</span>
								</button>
							))}
						</div>
					) : (
						<form className="registerBox" onSubmit={handleSubmit}>
							<div className="registerChosenType">
								<span>
									{accountType === "shop"
										? "Setting up a shop"
										: "Setting up as an independent artist"}
								</span>
								{/* Reversible. Picking the wrong one on the first screen should not
								    mean reloading the page. */}
								<button
									type="button"
									className="registerLinkButton"
									onClick={() => setAccountType(null)}
								>
									Change
								</button>
							</div>

							{accountType === "shop" && (
								<input
									placeholder="Shop name"
									className="registerInput"
									value={values.shopName}
									onChange={setField("shopName")}
								/>
							)}
							<input
								placeholder="First name"
								className="registerInput"
								value={values.firstName}
								onChange={setField("firstName")}
							/>
							<input
								placeholder="Last name"
								className="registerInput"
								value={values.lastName}
								onChange={setField("lastName")}
							/>
							<input
								placeholder="Email"
								className="registerInput"
								type="email"
								value={values.email}
								onChange={setField("email")}
							/>
							<input
								placeholder="Password"
								className="registerInput"
								type="password"
								value={values.password}
								onChange={setField("password")}
							/>
							<input
								placeholder="Confirm password"
								className="registerInput"
								type="password"
								value={values.confirmPassword}
								onChange={setField("confirmPassword")}
							/>
							{/* Offered on BOTH paths. A shop owner is an artist too - one account, one
							    login - so they need a link of their own exactly as much as an
							    independent artist does. Live availability check included, because
							    finding out a handle is taken after submitting a whole form is the
							    one failure this field exists to avoid. */}
							<BookingSlugField
								value={values.bookingSlug}
								setValue={setBookingSlug}
								error={errors.bookingSlug}
								helperText="Optional - you can change this later in Settings."
							/>
							<button className="registerButton" type="submit" disabled={loading}>
								{loading ? (
									<CircularProgress color="inherit" size="20px" />
								) : (
									"Create account"
								)}
							</button>
						</form>
					)}

					{Object.keys(errors).length > 0 && (
						<div className="errors">
							<ul className="list">
								{Object.values(errors).map((value) => (
									<li key={value}>{value}</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default Register;
