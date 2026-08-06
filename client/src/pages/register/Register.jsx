// Explicit React import - see scripts/check-react-in-tested-components.mjs. Under Vitest,
// @vitejs/plugin-react compiles JSX with the classic runtime, so anything a test renders needs
// React in scope.
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircularProgress, MenuItem, TextField } from "@mui/material";
import { gql, useApolloClient, useMutation } from "@apollo/client";
import { ROUTE_CONSTANTS } from "../../constants";
import { AuthContext } from "../../context/auth";
import BookingSlugField from "../../components/artist/BookingSlugField";
import { CURRENT_USER_FIELDS, GET_CURRENT_USER } from "../../services/UserService";
import NotificationService from "../../services/NotificationService";
import { ArtistService } from "../../services/ArtistService";
import ShopService from "../../services/ShopService";
import { suggestSlugOrBlank } from "../../utils/bookingSlug";
import {
	ACCOUNT_TYPES,
	BILLING_TYPES,
	FIELD_HELP,
	NOTIFICATION_CATEGORIES,
	digestHourOptions,
	timezoneOptions,
} from "./onboardingSteps";
import "./register.css";

/**
 * Signup as a guided setup, not a form.
 *
 * THE ACCOUNT IS CREATED IN THE MIDDLE, NOT AT THE END.
 *
 * Steps 1-2 collect what an account cannot exist without, and creating it is the last thing step 2
 * does. Everything after that - booking link, rates, notifications, shop cut - is applied with the
 * ORDINARY authenticated settings mutations, against the session that step 2 just returned.
 *
 * That ordering is the whole design, for three reasons:
 *
 *   - ABANDONMENT IS SAFE. Close the tab on step 4 and you have a working account with sensible
 *     defaults, not a half-filled form and nothing to log into. A wizard people can leave is a
 *     wizard people finish.
 *   - THE PUBLIC MUTATION STAYS SMALL. registerAccount is reachable by anyone on the internet.
 *     Every field added to it is another thing an unauthenticated caller can write. Rates, shop
 *     cut percentages and notification preferences all have authenticated mutations already, with
 *     their own ownership checks - routing signup through those means no new public write surface
 *     and no second copy of validation that can drift from the first.
 *   - NOTHING IS DUPLICATED. updateArtistRateSettings, updateNotificationSettings and updateShop
 *     are the same calls the Settings page makes. A setting configured here and the same setting
 *     changed later go through identical code.
 *
 * EVERY STEP AFTER THE SECOND IS SKIPPABLE, and says so. The most common reason a new shop owner
 * stalls is being asked for a number they haven't decided yet.
 */

/**
 * THE SAME SELECTION LOGIN MAKES, via the shared fragment - and exported so the test uses this
 * document rather than a copy of it.
 *
 * It didn't used to. This mutation hand-listed a handful of scalars and no `userInfo` at all,
 * which is a difference nothing complains about: the field is nullable, so the server returned a
 * perfectly valid User with no profile attached and the wizard cached it as the session. The
 * dashboard mostly worked, but Settings gates on `user.userInfo && user.userType === "artist"` and
 * showed "Nothing to configure here yet for this account type" to somebody who had just signed up
 * as an artist. Logging out and back in fixed it, because Login's document asked for the field.
 *
 * Two documents producing the same thing, only one of which was complete. Both spread
 * CurrentUserFields now, so there is nothing left to keep in sync by hand.
 */
export const REGISTER_ACCOUNT = gql`
	${CURRENT_USER_FIELDS}
	mutation RegisterAccount($input: RegisterAccountInput!) {
		registerAccount(input: $input) {
			...CurrentUserFields
			accessToken
			firebaseToken
		}
	}
`;

/**
 * Error keys that a control on the account step renders itself, as its own helperText.
 *
 * The summary box below the fields must NOT repeat these. It did, and the same sentence appeared
 * twice on screen - once under the email field and once in the red box - which reads as two
 * separate problems and makes the box look like it is listing something the fields missed.
 *
 * Everything NOT in this set still goes to the summary, so a key no field owns ('general', or
 * anything a future server change starts returning) is still shown rather than swallowed. That
 * direction matters: a duplicated error is untidy, an invisible one is a dead button.
 */
const FIELD_OWNED_ERRORS = new Set([
	"shopName",
	"firstName",
	"lastName",
	"email",
	"password",
	"confirmPassword",
	"bookingSlug",
]);

/**
 * A titled block with its own explanation. The unit every step is built from.
 *
 * A REAL <label htmlFor>, not a styled div. The visible label sits above the explanation, which
 * sits above the control - so the field is read in the order the decision is made. Doing that with
 * MUI's own floating label isn't possible (it lives inside the input), and a bare div would leave
 * every field on this page unlabelled for a screen reader and unfindable by accessible name.
 *
 * `id` is therefore required, not decorative: it is the only thing tying the label to the control.
 */
const Field = ({ id, label, help, children }) => (
	<div className="onboardField">
		<label className="onboardFieldLabel" htmlFor={id}>
			{label}
		</label>
		{help && <p className="onboardFieldHelp">{help}</p>}
		<div className="onboardFieldControl">{children}</div>
	</div>
);

const Register = () => {
	const context = useContext(AuthContext);
	const navigate = useNavigate();

	const [stepIndex, setStepIndex] = useState(0);
	const [accountType, setAccountType] = useState(null);
	const [errors, setErrors] = useState({});
	// Set once the account exists. Its presence is what makes the later steps able to save, and
	// what makes "finish" mean "go to the dashboard" rather than "create an account".
	const [account, setAccount] = useState(null);
	const [saving, setSaving] = useState(false);

	const zones = useMemo(() => timezoneOptions(), []);
	const hours = useMemo(() => digestHourOptions(), []);

	const [values, setValues] = useState({
		firstName: "",
		lastName: "",
		email: "",
		password: "",
		confirmPassword: "",
		shopName: "",
		bookingSlug: "",
		timezone: zones[0],
		digestHour: 8,
		billingType: "hourly",
		hourlyRate: "",
		flatRate: "",
		shopCutPercent: "",
		shopMinimum: "",
		// Notification toggles start undefined so an untouched account keeps the server's
		// role-aware defaults (see server/utils/notification-preferences.js) rather than having
		// this form assert a value nobody chose.
		moneyEmail: undefined,
		scheduleEmail: undefined,
		rosterEmail: undefined,
		messageEmail: undefined,
	});
	const [slugTouched, setSlugTouched] = useState(false);

	// Whether there was already a session when this page mounted.
	//
	// The /register route renders this component unconditionally, because the wizard logs you in at
	// step 2 and has to keep running afterwards. That means the "you are already signed in, go to
	// the dashboard" redirect has to live here instead - and it has to be decided ONCE, at mount,
	// from a ref rather than from context.user. Reading context.user in an effect would fire again
	// the moment step 2 logs the new account in, which is precisely the bounce this replaces.
	const hadSessionOnMount = useRef(Boolean(context.user?.id));
	useEffect(() => {
		if (hadSessionOnMount.current) {
			navigate(ROUTE_CONSTANTS.HOME);
		}
		// Mount only, deliberately - see above.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const apollo = useApolloClient();
	const [registerAccount, { loading: registering }] = useMutation(REGISTER_ACCOUNT);
	const [updateNotificationSettings] = useMutation(NotificationService.UPDATE_SETTINGS);
	const [updateArtistRateSettings] = useMutation(
		ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
	);
	// ShopService.updateShop() RETURNS the document rather than being one - it builds the gql inside
	// the function (see that file). Calling it here gets the document to hand to useMutation.
	const [updateShop] = useMutation(ShopService.updateShop());

	const isShop = accountType === "shop";

	const setField = (name) => (e) => {
		const next = e && e.target ? e.target.value : e;
		setValues((prev) => {
			const updated = { ...prev, [name]: next };
			// The booking link follows the name until it is edited. A prefill somebody can see and
			// overwrite is the design; a handle assigned silently is what User.username was.
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

	const setToggle = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

	// Whole dollars in, integer or null out. An empty field means "not set", not zero - a rate of
	// zero is a real answer and must not be what a blank produces.
	const intOrNull = (raw) => {
		const parsed = parseInt(String(raw).trim(), 10);
		return Number.isFinite(parsed) ? parsed : null;
	};

	const createAccount = async () => {
		setErrors({});
		setSaving(true);
		try {
			const { data } = await registerAccount({
				variables: {
					input: {
						accountType,
						firstName: values.firstName,
						lastName: values.lastName,
						email: values.email,
						password: values.password,
						confirmPassword: values.confirmPassword,
						...(isShop ? { shopName: values.shopName } : {}),
						// Omitted when blank rather than sent as "". An absent slug means "didn't
						// choose one"; a blank string would land on the unique index alongside
						// every other slug-less artist.
						...(values.bookingSlug ? { bookingSlug: values.bookingSlug } : {}),
					},
				},
			});
			const user = data.registerAccount;
			// Logged in immediately, because every step after this one calls an AUTHENTICATED
			// mutation and needs the token in context.
			context.login(user);
			setAccount(user);
			setStepIndex((i) => i + 1);
		} catch (err) {
			const fieldErrors = err.graphQLErrors?.[0]?.extensions?.errors;
			setErrors(fieldErrors || { general: err.message });
		} finally {
			setSaving(false);
		}
	};

	/**
	 * Saves one step and moves on.
	 *
	 * A failure advances anyway, deliberately, with the error shown. These are OPTIONAL settings on
	 * an account that already exists - blocking somebody inside onboarding because a rate failed to
	 * save would be a worse outcome than letting them reach a dashboard and fix it in Settings.
	 */
	const saveAndContinue = async (save) => {
		setErrors({});
		setSaving(true);
		try {
			await save();
		} catch (err) {
			setErrors({ general: err.graphQLErrors?.[0]?.message || err.message });
		} finally {
			setSaving(false);
			setStepIndex((i) => i + 1);
		}
	};

	const saveNotifications = () =>
		saveAndContinue(() =>
			updateNotificationSettings({
				variables: {
					// Only the toggles that were actually touched. Sending undefined for the rest
					// leaves the server's role-aware defaults in place.
					prefs: {
						moneyEmail: values.moneyEmail,
						scheduleEmail: values.scheduleEmail,
						rosterEmail: values.rosterEmail,
						messageEmail: values.messageEmail,
					},
					timezone: values.timezone,
					digestHour: values.digestHour,
				},
			}),
		);

	const saveRates = () =>
		saveAndContinue(() =>
			updateArtistRateSettings({
				variables: {
					billingType: values.billingType,
					hourlyRate: intOrNull(values.hourlyRate),
					flatRate: intOrNull(values.flatRate),
				},
			}),
		);

	const saveShop = () =>
		saveAndContinue(async () => {
			const shopId = account?.userInfo?.shop?.id || context.user?.userInfo?.shop?.id;
			if (!shopId) {
				// Nothing to save against. Not an error worth showing - the shop exists server-side
				// and these two numbers default to 0, both changeable in shop settings.
				return;
			}
			await updateShop({
				variables: {
					shop: {
						id: shopId,
						shopCutPercent: intOrNull(values.shopCutPercent) ?? 0,
						shopMinimum: intOrNull(values.shopMinimum) ?? 0,
					},
				},
			});
		});

	/**
	 * Leaves the wizard with a session that matches what was just configured.
	 *
	 * WHY A REFETCH RATHER THAN "IT'S ALREADY RIGHT". The account is cached at step two and then
	 * steps three to five change it - a rate, a timezone, a shop cut. Those go through the same
	 * authenticated mutations Settings uses, so the SERVER is correct either way, but the copy of
	 * the user sitting in auth context is whatever step two returned. Reading it back once, here,
	 * is what makes "finished the wizard" and "logged in fresh" produce the same app, which is the
	 * only version of this anybody can reason about.
	 *
	 * THE TOKENS ARE CARRIED OVER EXPLICITLY. getUser returns the stored User document, where
	 * accessToken and firebaseToken are null - they exist only on the response to logging in.
	 * Spreading the refetched user over the cached one without putting them back would blank the
	 * credential and sign somebody out at the exact moment they finished signing up. (This is also
	 * why CurrentUserFields doesn't select them - see UserService.)
	 *
	 * A FAILED REFRESH STILL LEAVES. The account exists and the session is valid; refusing to
	 * navigate because a refetch failed would trap somebody inside onboarding over something a
	 * page reload fixes.
	 */
	const finish = async () => {
		const current = account || context.user;
		const userId = current?.id;
		if (userId) {
			setSaving(true);
			try {
				const { data } = await apollo.query({
					query: GET_CURRENT_USER,
					variables: { userId },
					fetchPolicy: "network-only",
				});
				if (data?.getUser) {
					context.updateCurrentUser({
						...current,
						...data.getUser,
						accessToken: current.accessToken,
						firebaseToken: current.firebaseToken,
					});
				}
			} catch {
				// Deliberately swallowed - see above.
			} finally {
				setSaving(false);
			}
		}
		navigate(ROUTE_CONSTANTS.HOME);
	};

	// Built as data so the progress indicator and the navigation don't have to know which step is
	// which - and so the shop-only step simply isn't in the list for an artist, rather than being
	// present and skipped, which is how off-by-one bugs get into step counters.
	const steps = [
		{ key: "type", title: "What are you signing up as?" },
		{
			key: "account",
			title: isShop ? "About you and your shop" : "About you",
			subtitle: "This is what you'll use to sign in.",
		},
		{
			key: "notifications",
			title: "How should we reach you?",
			subtitle: "Sensible defaults are already set. Change anything that doesn't suit you.",
		},
		{
			key: "rates",
			title: "Your rates",
			subtitle: "A starting point for new sessions. You can override it on any single one.",
		},
		...(isShop
			? [
					{
						key: "shop",
						title: "Your shop's cut",
						subtitle: "How the shop takes its share of an artist's work.",
					},
			  ]
			: []),
		{ key: "done", title: "You're set up" },
	];

	const step = steps[Math.min(stepIndex, steps.length - 1)];

	const renderStep = () => {
		switch (step.key) {
			case "type":
				return (
					<div className="onboardChoices">
						{ACCOUNT_TYPES.map((option) => (
							<button
								key={option.value}
								type="button"
								className={
									accountType === option.value
										? "onboardChoice onboardChoiceSelected"
										: "onboardChoice"
								}
								onClick={() => {
									setAccountType(option.value);
									setStepIndex(1);
								}}
							>
								<span className="onboardChoiceTitle">{option.title}</span>
								<span className="onboardChoiceBlurb">{option.blurb}</span>
							</button>
						))}
					</div>
				);

			case "account":
				return (
					<>
						{isShop && (
							<Field id="shopName" label="Shop name" help={FIELD_HELP.shopName}>
								<TextField
									id="shopName"
									fullWidth
									value={values.shopName}
									onChange={setField("shopName")}
									error={Boolean(errors.shopName)}
									helperText={errors.shopName || " "}
								/>
							</Field>
						)}
						<div className="onboardRow">
							<Field id="firstName" label="First name">
								<TextField
									id="firstName"
									fullWidth
									value={values.firstName}
									onChange={setField("firstName")}
									error={Boolean(errors.firstName)}
									helperText={errors.firstName || " "}
								/>
							</Field>
							<Field id="lastName" label="Last name">
								<TextField
									id="lastName"
									fullWidth
									value={values.lastName}
									onChange={setField("lastName")}
									error={Boolean(errors.lastName)}
									helperText={errors.lastName || " "}
								/>
							</Field>
						</div>
						<Field id="email" label="Email">
							<TextField
								id="email"
								fullWidth
								type="email"
								value={values.email}
								onChange={setField("email")}
								error={Boolean(errors.email)}
								helperText={errors.email || " "}
							/>
						</Field>
						<div className="onboardRow">
							<Field id="password" label="Password">
								<TextField
									id="password"
									fullWidth
									type="password"
									// Stops the browser filling in a SAVED credential. Without it,
									// Chrome and Safari treat any type="password" field as a login
									// box and prefill the password for whatever account they have
									// stored for this origin - on a signup form that is both
									// confusing and a way to create an account whose password
									// nobody chose.
									autoComplete="new-password"
									value={values.password}
									onChange={setField("password")}
									error={Boolean(errors.password)}
									helperText={errors.password || "At least 8 characters."}
								/>
							</Field>
							<Field id="confirmPassword" label="Confirm password">
								<TextField
									id="confirmPassword"
									fullWidth
									type="password"
									autoComplete="new-password"
									value={values.confirmPassword}
									onChange={setField("confirmPassword")}
									error={Boolean(errors.confirmPassword)}
									helperText={errors.confirmPassword || " "}
								/>
							</Field>
						</div>
						{/* NOT wrapped in a Field - BookingSlugField renders its own label and its own
						    live availability check. Two labels for one control is worse than none:
						    a screen reader reads both, and getByLabelText finds two matches. */}
						<div className="onboardField">
							<div className="onboardFieldLabel">Your booking link</div>
							<p className="onboardFieldHelp">{FIELD_HELP.bookingSlug}</p>
							<BookingSlugField
								value={values.bookingSlug}
								setValue={setBookingSlug}
								error={errors.bookingSlug}
								label="Booking link"
								helperText="Optional - you can choose one later in Settings."
							/>
						</div>
					</>
				);

			case "notifications":
				return (
					<>
						{NOTIFICATION_CATEGORIES.map((category) => (
							<Field key={category.key} id={category.key} label={category.label} help={category.what}>
								<TextField
									id={category.key}
									select
									fullWidth
									value={
										values[category.key] === undefined
											? "default"
											: String(values[category.key])
									}
									onChange={(e) =>
										setToggle(
											category.key,
											e.target.value === "default"
												? undefined
												: e.target.value === "true",
										)
									}
								>
									{/* "Default" is a real, selectable answer rather than a blank,
									    because the defaults differ by role and an empty control
									    would hide that a sensible choice is already in effect. */}
									<MenuItem value="default">
										Default ({isShop ? category.shopDefault : category.artistDefault})
									</MenuItem>
									<MenuItem value="true">Email me</MenuItem>
									<MenuItem value="false">Don't email me</MenuItem>
								</TextField>
							</Field>
						))}
						<Field id="timezone" label="Your timezone" help={FIELD_HELP.timezone}>
							<TextField
								id="timezone"
								select
								fullWidth
								value={values.timezone}
								onChange={setField("timezone")}
							>
								{zones.map((zone) => (
									<MenuItem key={zone} value={zone}>
										{zone.replace(/_/g, " ")}
									</MenuItem>
								))}
							</TextField>
						</Field>
						<Field id="digestHour" label="Daily summary arrives at" help={FIELD_HELP.digestHour}>
							<TextField
								id="digestHour"
								select
								fullWidth
								value={values.digestHour}
								onChange={(e) => setToggle("digestHour", Number(e.target.value))}
							>
								{hours.map((hour) => (
									<MenuItem key={hour.value} value={hour.value}>
										{hour.label}
									</MenuItem>
								))}
							</TextField>
						</Field>
					</>
				);

			case "rates":
				return (
					<>
						<Field id="billingType" label="How do you price work?">
							<TextField
								id="billingType"
								select
								fullWidth
								value={values.billingType}
								onChange={setField("billingType")}
							>
								{BILLING_TYPES.map((type) => (
									<MenuItem key={type.value} value={type.value}>
										{type.label}
									</MenuItem>
								))}
							</TextField>
							<p className="onboardFieldHelp">
								{BILLING_TYPES.find((t) => t.value === values.billingType)?.what}
							</p>
						</Field>
						<Field id="hourlyRate" label="Hourly rate ($)" help={FIELD_HELP.hourlyRate}>
							<TextField
								id="hourlyRate"
								fullWidth
								type="number"
								value={values.hourlyRate}
								onChange={setField("hourlyRate")}
								inputProps={{ min: 0 }}
							/>
						</Field>
						<Field id="flatRate" label="Flat rate ($)" help={FIELD_HELP.flatRate}>
							<TextField
								id="flatRate"
								fullWidth
								type="number"
								value={values.flatRate}
								onChange={setField("flatRate")}
								inputProps={{ min: 0 }}
							/>
						</Field>
					</>
				);

			case "shop":
				return (
					<>
						<Field id="shopCutPercent" label="Shop cut (%)" help={FIELD_HELP.shopCutPercent}>
							<TextField
								id="shopCutPercent"
								fullWidth
								type="number"
								value={values.shopCutPercent}
								onChange={setField("shopCutPercent")}
								inputProps={{ min: 0, max: 100 }}
							/>
						</Field>
						<Field id="shopMinimum" label="Shop minimum ($)" help={FIELD_HELP.shopMinimum}>
							<TextField
								id="shopMinimum"
								fullWidth
								type="number"
								value={values.shopMinimum}
								onChange={setField("shopMinimum")}
								inputProps={{ min: 0 }}
							/>
						</Field>
					</>
				);

			case "done":
			default:
				return (
					<div className="onboardDone">
						<p>
							Your account is ready
							{values.bookingSlug ? (
								<>
									{" "}
									and your booking link is{" "}
									<strong>/book/{values.bookingSlug}</strong>
								</>
							) : null}
							.
						</p>
						<p className="onboardFieldHelp">
							Everything you just set - and everything you skipped - lives in Settings.
						</p>
					</div>
				);
		}
	};

	// One place decides what the primary button does, so the button itself can't drift out of step
	// with the step it belongs to.
	const primaryAction = () => {
		switch (step.key) {
			case "account":
				return { label: "Create account", run: createAccount };
			case "notifications":
				return { label: "Save and continue", run: saveNotifications };
			case "rates":
				return { label: "Save and continue", run: saveRates };
			case "shop":
				return { label: "Save and continue", run: saveShop };
			case "done":
				return { label: "Go to my dashboard", run: finish };
			default:
				return null;
		}
	};

	const unownedErrors = Object.entries(errors)
		.filter(([key]) => !FIELD_OWNED_ERRORS.has(key))
		.map(([, message]) => message);

	const action = primaryAction();
	const busy = saving || registering;
	// Skippable once the account exists and before the last screen. Deliberately not offered on the
	// account step, where there is nothing yet to skip to.
	const canSkip = Boolean(account) && step.key !== "done";

	return (
		<div className="register">
			<div className="onboardCard">
				<div className="onboardHeader">
					<h3 className="onboardLogo">Inkbooks</h3>
					<span className="onboardProgress">
						Step {Math.min(stepIndex + 1, steps.length)} of {steps.length}
					</span>
				</div>

				<div className="onboardProgressBar">
					<div
						className="onboardProgressBarFill"
						style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
					/>
				</div>

				<div className="onboardBody">
					<h2 className="onboardTitle">{step.title}</h2>
					{step.subtitle && <p className="onboardSubtitle">{step.subtitle}</p>}

					<div className="onboardFields">{renderStep()}</div>

					{/* Only what no field is already showing - see FIELD_OWNED_ERRORS. */}
					{unownedErrors.length > 0 && (
						<div className="onboardErrors">
							<ul>
								{unownedErrors.map((message) => (
									<li key={message}>{message}</li>
								))}
							</ul>
						</div>
					)}
				</div>

				<div className="onboardActions">
					<div className="onboardActionsLeft">
						{/* Only before the account exists. Going "back" past account creation would
						    imply the account can be un-created, which it can't. */}
						{stepIndex === 1 && !account && (
							<button
								type="button"
								className="onboardLinkButton"
								onClick={() => setStepIndex(0)}
							>
								Back
							</button>
						)}
						{canSkip && (
							<button
								type="button"
								className="onboardLinkButton"
								onClick={() => setStepIndex((i) => i + 1)}
							>
								Skip for now
							</button>
						)}
					</div>
					{action && (
						<button
							type="button"
							className="onboardPrimaryButton"
							onClick={action.run}
							disabled={busy}
						>
							{busy ? <CircularProgress color="inherit" size="18px" /> : action.label}
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

export default Register;
