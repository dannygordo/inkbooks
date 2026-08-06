import React from "react";
import { useMutation } from "@apollo/client";
import EntityWizard from "./EntityWizard";
import AccountService from "../../services/AccountService";
import BookingSlugField from "../artist/BookingSlugField";
import { suggestSlugOrBlank } from "../../utils/bookingSlug";
import "./entityWizard.css";

/**
 * The three creation wizards. Each is a step definition plus a submit - everything about being a
 * wizard lives in EntityWizard.
 *
 * Steps are split by what the shop admin actually knows at each moment, not evenly by field
 * count. Identity (name and email) comes first because it's the part they always have to hand and
 * the part the account can't be created without; contact details come second because they're
 * often on a business card the admin is still looking for. A single long form would make the
 * optional half look as mandatory as the required half.
 */

// Shown after an artist or staff account is created. The link is displayed rather than merely
// promised because utils/email.js no-ops when the provider isn't configured - "we've emailed
// them" would be a claim this app can't verify, and an admin with no way to check is an admin
// whose new hire quietly never gets in.
const InviteResult = ({ name, email, inviteLink }) => (
	<div className="entityWizardDone">
		<h3 className="entityWizardDoneTitle">{name} has been added</h3>
		<p className="entityWizardHint">
			An invite to set their password has been emailed to {email}. If it doesn't arrive,
			send them this link directly - it works once, and expires in a week.
		</p>
		<div className="entityWizardInviteBox">{inviteLink}</div>
	</div>
);

export const CreateClientWizard = ({ onClose, onCreated }) => {
	const [createClientAccount] = useMutation(AccountService.CREATE_CLIENT_ACCOUNT);

	const steps = [
		{
			title: "Who is the client?",
			subtitle: "Name and email are enough to create the record.",
			fields: [
				{ name: "firstName", label: "First name", required: true },
				{ name: "lastName", label: "Last name", required: true },
				{ name: "email", label: "Email", type: "email", required: true },
				{ name: "phone", label: "Phone" },
			],
		},
		{
			title: "Anything else?",
			subtitle: "All optional - you can fill these in later from their record.",
			fields: [
				{ name: "city", label: "City" },
				{ name: "state", label: "State" },
				{ name: "zip", label: "Zip" },
				{ name: "instagram", label: "Instagram" },
			],
		},
	];

	return (
		<EntityWizard
			steps={steps}
			submitLabel="Add client"
			onClose={onClose}
			onSubmit={async (values) => {
				const { data } = await createClientAccount({ variables: { input: values } });
				const result = data.createClientAccount;
				if (onCreated) {
					onCreated();
				}
				// isNewAccount is false when this email already had an account - usually because
				// they booked online before and a receptionist is adding them by hand not knowing
				// that. Said plainly rather than implying something was created: a duplicate is
				// exactly the thing someone needs to be told about.
				return (
					<div className="entityWizardDone">
						<h3 className="entityWizardDoneTitle">
							{result.client.firstName} {result.client.lastName}{" "}
							{result.isNewAccount ? "has been added" : "was already on file"}
						</h3>
						<p className="entityWizardHint">
							{result.isNewAccount
								? "They can book and view their projects once they set a password - they can do that themselves from the login screen whenever they need to."
								: "This email already had an account, so their existing record has been updated rather than duplicated."}
						</p>
					</div>
				);
			}}
		/>
	);
};

export const CreateArtistWizard = ({ onClose, onCreated }) => {
	// No useAuth() here any more. The only thing this wizard needed the logged-in user for was the
	// shop id it sent, and the server works that out itself now - leaving the hook in place would
	// suggest the browser still has a say in which shop an artist joins.
	const [createArtistAccount] = useMutation(AccountService.CREATE_ARTIST_ACCOUNT);

	const steps = [
		{
			title: "Who is the artist?",
			subtitle: "They'll get an email inviting them to set their own password.",
			fields: [
				{ name: "firstName", label: "First name", required: true },
				{ name: "lastName", label: "Last name", required: true },
				{ name: "email", label: "Email", type: "email", required: true },
				{ name: "title", label: "Title", helperText: "e.g. Resident Artist" },
			],
		},
		{
			title: "Booking link",
			subtitle:
				"The link this artist hands out for booking requests. Optional - they can choose one later from Settings, and their booking page works either way.",
			fields: [
				{
					name: "bookingSlug",
					label: "Booking link",
					// Prefilled from the name, never applied silently. An auto-assigned handle
					// nobody chose and nobody was shown is exactly what User.username was, and it
					// was invisible to its owner right up until it locked them out. The admin sees
					// the suggestion and can overwrite it before anything is written.
					render: ({ value, setValue, error, values }) => (
						<BookingSlugField
							value={value || suggestSlugOrBlank(values.firstName, values.lastName)}
							setValue={setValue}
							error={error}
						/>
					),
				},
			],
		},
		{
			title: "Contact and rate",
			subtitle: "All optional - the artist can fill these in themselves.",
			fields: [
				{ name: "phone", label: "Phone" },
				{ name: "instagram", label: "Instagram" },
				{ name: "facebook", label: "Facebook" },
				{
					name: "hourlyRate",
					label: "Hourly rate $",
					type: "number",
					// Whole dollars, matching how the rate is stored - see server/utils/money.js
					// on why rates stayed in dollars while transactions moved to cents.
					helperText: "Leave blank to use the shop's rate",
				},
			],
		},
	];

	return (
		<EntityWizard
			steps={steps}
			submitLabel="Add artist"
			onClose={onClose}
			onSubmit={async (values) => {
				const { data } = await createArtistAccount({
					variables: {
						input: {
							...values,
							hourlyRate: values.hourlyRate ? parseInt(values.hourlyRate, 10) : null,
							// Prefilled from the name when the admin left the field untouched -
							// the suggestion is what they saw on screen, so it's what they agreed
							// to. Empty string rather than undefined would be wrong: the server
							// treats a blank as "no slug", and '' on a unique index collides
							// across every slug-less artist (see models/Artist.js).
							bookingSlug:
								(values.bookingSlug ||
									suggestSlugOrBlank(values.firstName, values.lastName)) ||
								undefined,
							// NO shopId. The server derives it from the creating admin (see
							// resolveShopIdForNewAccount in mutations/accounts.js).
							//
							// This used to send user.userInfo?.shop?.id - the shop id cached in the
							// browser at login. Two ways that goes wrong and neither is visible
							// here: empty, and the artist was created with no shop connection and
							// no error; stale, and it names a shop this admin may no longer belong
							// to, which the server refuses with "Action not allowed". The browser
							// has no business answering a question the server can answer exactly.
						},
					},
				});
				if (onCreated) {
					onCreated();
				}
				return (
					<InviteResult
						name={`${values.firstName} ${values.lastName}`}
						email={values.email}
						inviteLink={data.createArtistAccount.inviteLink}
					/>
				);
			}}
		/>
	);
};

export const CreateStaffWizard = ({ onClose, onCreated }) => {
	const [createStaffAccount] = useMutation(AccountService.CREATE_STAFF_ACCOUNT);

	const steps = [
		{
			title: "Who is joining the shop?",
			subtitle: "They'll get an email inviting them to set their own password.",
			fields: [
				{ name: "firstName", label: "First name", required: true },
				{ name: "lastName", label: "Last name", required: true },
				{ name: "email", label: "Email", type: "email", required: true },
				{ name: "title", label: "Title", helperText: "e.g. Shop Manager" },
			],
		},
		{
			title: "Contact details",
			subtitle: "All optional.",
			fields: [
				{ name: "phone", label: "Phone" },
				{ name: "instagram", label: "Instagram" },
				{ name: "facebook", label: "Facebook" },
			],
		},
	];

	return (
		<EntityWizard
			steps={steps}
			submitLabel="Add staff member"
			onClose={onClose}
			onSubmit={async (values) => {
				const { data } = await createStaffAccount({
					variables: {
						// Same as the artist wizard: the server resolves the shop from the creator.
						input: values,
					},
				});
				if (onCreated) {
					onCreated();
				}
				return (
					<InviteResult
						name={`${values.firstName} ${values.lastName}`}
						email={values.email}
						inviteLink={data.createStaffAccount.inviteLink}
					/>
				);
			}}
		/>
	);
};
