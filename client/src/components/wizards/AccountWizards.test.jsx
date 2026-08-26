// AccountWizards.jsx tests. Each exported wizard (CreateClientWizard/CreateArtistWizard/
// CreateStaffWizard) is just a step definition plus a submit - all of the stepping/validation/
// error/result-rendering behaviour lives in EntityWizard and is covered by EntityWizard.test.jsx.
// What's worth pinning down here is specific to each wizard: which fields it asks for and in what
// order, that its mutation is called with the right variables, and what the final screen says
// (including the "already on file" branch createClientAccount can return).
//
// BookingSlugField (used via the artist wizard's `render` field for its booking-link step) is
// mocked to a trivial stub - it owns its own debounced availability-check query against
// ArtistService, which is exercised by its own test file (BookingSlugField.test.jsx), not this
// one. Mocking it here keeps these tests about AccountWizards' own wiring: does the artist wizard
// actually reach BookingSlugField with a sensible prefilled value, not whether that field's own
// Apollo query behaves.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { GraphQLError } from "graphql";
import {
	CreateClientWizard,
	CreateArtistWizard,
	CreateStaffWizard,
} from "./AccountWizards";
import AccountService from "../../services/AccountService";

vi.mock("../artist/BookingSlugField", () => ({
	default: ({ value, setValue, error }) => (
		<div>
			<label htmlFor="bookingSlugStub">Booking link stub</label>
			<input
				id="bookingSlugStub"
				value={value || ""}
				onChange={(e) => setValue(e.target.value)}
			/>
			{error && <span>{error}</span>}
		</div>
	),
}));

function renderWizard(ui, { mocks = [] } = {}) {
	return render(<MockedProvider mocks={mocks}>{ui}</MockedProvider>);
}

describe("CreateClientWizard", () => {
	it("asks identity fields on step 1 and optional details on step 2", async () => {
		renderWizard(<CreateClientWizard onClose={vi.fn()} onCreated={vi.fn()} />);

		expect(screen.getByText("Who is the client?")).toBeInTheDocument();
		expect(screen.getByLabelText("First name *")).toBeInTheDocument();
		expect(screen.getByLabelText("Last name *")).toBeInTheDocument();
		expect(screen.getByLabelText("Email *")).toBeInTheDocument();
		expect(screen.getByLabelText("Phone")).toBeInTheDocument();

		const user = userEvent.setup();
		await user.type(screen.getByLabelText("First name *"), "Arya");
		await user.type(screen.getByLabelText("Last name *"), "Stark");
		await user.type(screen.getByLabelText("Email *"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByText("Anything else?")).toBeInTheDocument();
		expect(screen.getByLabelText("City")).toBeInTheDocument();
		expect(screen.getByLabelText("State")).toBeInTheDocument();
		expect(screen.getByLabelText("Zip")).toBeInTheDocument();
		expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
	});

	it("submits with the collected input and reports a new account created", async () => {
		const user = userEvent.setup();
		const onCreated = vi.fn();
		const mocks = [
			{
				request: {
					query: AccountService.CREATE_CLIENT_ACCOUNT,
					// EntityWizard only ever puts a key into `values` for a field the user actually
					// typed into (see EntityWizard.jsx's setValue) - state/zip/instagram are left
					// untouched below, so they're absent from the submitted object entirely, not
					// sent as empty strings.
					variables: {
						input: {
							firstName: "Arya",
							lastName: "Stark",
							email: "arya@example.com",
							phone: "555-0100",
							city: "Winterfell",
						},
					},
				},
				result: {
					data: {
						createClientAccount: {
							__typename: "CreateClientAccountResult",
							isNewAccount: true,
							client: {
								__typename: "Client",
								id: "client-1",
								firstName: "Arya",
								lastName: "Stark",
								email: "arya@example.com",
								phone: "555-0100",
							},
						},
					},
				},
			},
		];
		renderWizard(<CreateClientWizard onClose={vi.fn()} onCreated={onCreated} />, { mocks });

		await user.type(screen.getByLabelText("First name *"), "Arya");
		await user.type(screen.getByLabelText("Last name *"), "Stark");
		await user.type(screen.getByLabelText("Email *"), "arya@example.com");
		await user.type(screen.getByLabelText("Phone"), "555-0100");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.type(screen.getByLabelText("City"), "Winterfell");
		await user.click(screen.getByRole("button", { name: "Add client" }));

		expect(await screen.findByText("Arya Stark has been added")).toBeInTheDocument();
		expect(
			screen.getByText(/They can book and view their projects once they set a password/),
		).toBeInTheDocument();
		expect(onCreated).toHaveBeenCalledTimes(1);
	});

	it("reports the record was updated, not created, when isNewAccount is false", async () => {
		const user = userEvent.setup();
		const mocks = [
			{
				request: {
					query: AccountService.CREATE_CLIENT_ACCOUNT,
					variables: {
						input: {
							firstName: "Arya",
							lastName: "Stark",
							email: "arya@example.com",
						},
					},
				},
				result: {
					data: {
						createClientAccount: {
							__typename: "CreateClientAccountResult",
							isNewAccount: false,
							client: {
								__typename: "Client",
								id: "client-1",
								firstName: "Arya",
								lastName: "Stark",
								email: "arya@example.com",
								phone: "",
							},
						},
					},
				},
			},
		];
		renderWizard(<CreateClientWizard onClose={vi.fn()} onCreated={vi.fn()} />, { mocks });

		await user.type(screen.getByLabelText("First name *"), "Arya");
		await user.type(screen.getByLabelText("Last name *"), "Stark");
		await user.type(screen.getByLabelText("Email *"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("button", { name: "Add client" }));

		expect(await screen.findByText("Arya Stark was already on file")).toBeInTheDocument();
		expect(
			screen.getByText(/This email already had an account/),
		).toBeInTheDocument();
	});

	// A malformed email is caught by EntityWizard's own client-side check before Next even
	// advances (see EntityWizard.test.jsx) - so a genuinely SERVER-side failure needs a
	// well-formed email that the server itself rejects (e.g. already registered under a
	// different account type).
	it("shows the server's error inline when creation fails", async () => {
		const user = userEvent.setup();
		const mocks = [
			{
				request: {
					query: AccountService.CREATE_CLIENT_ACCOUNT,
					variables: {
						input: {
							firstName: "Arya",
							lastName: "Stark",
							email: "arya@example.com",
						},
					},
				},
				result: { errors: [new GraphQLError("This email already belongs to an artist account.")] },
			},
		];
		renderWizard(<CreateClientWizard onClose={vi.fn()} onCreated={vi.fn()} />, { mocks });

		await user.type(screen.getByLabelText("First name *"), "Arya");
		await user.type(screen.getByLabelText("Last name *"), "Stark");
		await user.type(screen.getByLabelText("Email *"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("button", { name: "Add client" }));

		expect(
			await screen.findByText("This email already belongs to an artist account."),
		).toBeInTheDocument();
	});
});

describe("CreateArtistWizard", () => {
	it("has an identity step, a booking-link step, and a contact/rate step, in that order", async () => {
		const user = userEvent.setup();
		renderWizard(<CreateArtistWizard onClose={vi.fn()} onCreated={vi.fn()} />);

		expect(screen.getByText("Who is the artist?")).toBeInTheDocument();
		await user.type(screen.getByLabelText("First name *"), "Gendry");
		await user.type(screen.getByLabelText("Last name *"), "Baratheon");
		await user.type(screen.getByLabelText("Email *"), "gendry@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByText("Booking link")).toBeInTheDocument();
		// BookingSlugField is mocked - the artist wizard prefills it from the name typed on step 1.
		expect(screen.getByLabelText("Booking link stub")).toHaveValue("gendry-baratheon");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByText("Contact and rate")).toBeInTheDocument();
		expect(screen.getByLabelText("Phone")).toBeInTheDocument();
		expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
		expect(screen.getByLabelText("Facebook")).toBeInTheDocument();
		expect(screen.getByLabelText("Hourly rate $")).toBeInTheDocument();
	});

	it("submits the invite request, parses the hourly rate, and shows the invite link", async () => {
		const user = userEvent.setup();
		const onCreated = vi.fn();
		const mocks = [
			{
				request: {
					query: AccountService.CREATE_ARTIST_ACCOUNT,
					// title/phone/instagram/facebook are never typed into below, so - same as the
					// client wizard tests above - they're absent from `values` entirely.
					// bookingSlug/hourlyRate are always present: onSubmit assigns them explicitly
					// rather than spreading them from `values` untouched (see AccountWizards.jsx).
					variables: {
						input: {
							firstName: "Gendry",
							lastName: "Baratheon",
							email: "gendry@example.com",
							bookingSlug: "gendry-baratheon",
							hourlyRate: 150,
						},
					},
				},
				result: {
					data: {
						createArtistAccount: {
							__typename: "CreateArtistAccountResult",
							inviteLink: "https://inkbooks.test/invite/abc123",
							artist: {
								__typename: "Artist",
								id: "artist-1",
								firstName: "Gendry",
								lastName: "Baratheon",
								email: "gendry@example.com",
								title: "",
								userId: "user-1",
							},
						},
					},
				},
			},
		];
		renderWizard(<CreateArtistWizard onClose={vi.fn()} onCreated={onCreated} />, { mocks });

		await user.type(screen.getByLabelText("First name *"), "Gendry");
		await user.type(screen.getByLabelText("Last name *"), "Baratheon");
		await user.type(screen.getByLabelText("Email *"), "gendry@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.type(screen.getByLabelText("Hourly rate $"), "150");
		await user.click(screen.getByRole("button", { name: "Add artist" }));

		expect(await screen.findByText("Gendry Baratheon has been added")).toBeInTheDocument();
		expect(screen.getByText("https://inkbooks.test/invite/abc123")).toBeInTheDocument();
		expect(
			screen.getByText(/An invite to set their password has been emailed to gendry@example.com/),
		).toBeInTheDocument();
		expect(onCreated).toHaveBeenCalledTimes(1);
	});

	it("lets the admin overwrite the suggested booking slug before submitting", async () => {
		const user = userEvent.setup();
		const mocks = [
			{
				request: {
					query: AccountService.CREATE_ARTIST_ACCOUNT,
					variables: {
						input: {
							firstName: "Gendry",
							lastName: "Baratheon",
							email: "gendry@example.com",
							bookingSlug: "the-bull",
							hourlyRate: null,
						},
					},
				},
				result: {
					data: {
						createArtistAccount: {
							__typename: "CreateArtistAccountResult",
							inviteLink: "https://inkbooks.test/invite/xyz",
							artist: {
								__typename: "Artist",
								id: "artist-1",
								firstName: "Gendry",
								lastName: "Baratheon",
								email: "gendry@example.com",
								title: "",
								userId: "user-1",
							},
						},
					},
				},
			},
		];
		renderWizard(<CreateArtistWizard onClose={vi.fn()} onCreated={vi.fn()} />, { mocks });

		await user.type(screen.getByLabelText("First name *"), "Gendry");
		await user.type(screen.getByLabelText("Last name *"), "Baratheon");
		await user.type(screen.getByLabelText("Email *"), "gendry@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));

		const slugField = screen.getByLabelText("Booking link stub");
		// This field's displayed value falls back to a suggested slug whenever the underlying
		// value is falsy (see CreateArtistWizard's own `render` field in AccountWizards.jsx) - so
		// user.clear() alone doesn't leave it empty: the moment onChange("") lands, the very next
		// render immediately re-derives the suggested slug and puts it right back, and a
		// subsequent user.type() then inserts into THAT text rather than into an empty field.
		// Selecting the full text before typing replaces it in one edit instead, the same way a
		// real person overwriting a prefilled suggestion would.
		await user.tripleClick(slugField);
		await user.keyboard("the-bull");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("button", { name: "Add artist" }));

		expect(await screen.findByText("https://inkbooks.test/invite/xyz")).toBeInTheDocument();
	});
});

describe("CreateStaffWizard", () => {
	it("has an identity step and a contact-only step, with no booking-link or rate fields", async () => {
		const user = userEvent.setup();
		renderWizard(<CreateStaffWizard onClose={vi.fn()} onCreated={vi.fn()} />);

		expect(screen.getByText("Who is joining the shop?")).toBeInTheDocument();
		await user.type(screen.getByLabelText("First name *"), "Hot");
		await user.type(screen.getByLabelText("Last name *"), "Pie");
		await user.type(screen.getByLabelText("Email *"), "hotpie@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByText("Contact details")).toBeInTheDocument();
		expect(screen.getByLabelText("Phone")).toBeInTheDocument();
		expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
		expect(screen.getByLabelText("Facebook")).toBeInTheDocument();
		expect(screen.queryByText("Booking link")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Hourly rate $")).not.toBeInTheDocument();
	});

	it("submits the plain input object as-is and shows the invite link", async () => {
		const user = userEvent.setup();
		const onCreated = vi.fn();
		const mocks = [
			{
				request: {
					query: AccountService.CREATE_STAFF_ACCOUNT,
					// The staff wizard's onSubmit sends `values` as-is with no field defaulting
					// (see AccountWizards.jsx) - phone/instagram/facebook are never typed into
					// below, so they're absent here too.
					variables: {
						input: {
							firstName: "Hot",
							lastName: "Pie",
							email: "hotpie@example.com",
							title: "Shop Manager",
						},
					},
				},
				result: {
					data: {
						createStaffAccount: {
							__typename: "CreateStaffAccountResult",
							inviteLink: "https://inkbooks.test/invite/staff1",
							staff: {
								__typename: "Staff",
								id: "staff-1",
								firstName: "Hot",
								lastName: "Pie",
								email: "hotpie@example.com",
								title: "Shop Manager",
								userId: "user-2",
							},
						},
					},
				},
			},
		];
		renderWizard(<CreateStaffWizard onClose={vi.fn()} onCreated={onCreated} />, { mocks });

		await user.type(screen.getByLabelText("First name *"), "Hot");
		await user.type(screen.getByLabelText("Last name *"), "Pie");
		await user.type(screen.getByLabelText("Email *"), "hotpie@example.com");
		await user.type(screen.getByLabelText("Title"), "Shop Manager");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("button", { name: "Add staff member" }));

		expect(await screen.findByText("Hot Pie has been added")).toBeInTheDocument();
		expect(screen.getByText("https://inkbooks.test/invite/staff1")).toBeInTheDocument();
		expect(onCreated).toHaveBeenCalledTimes(1);
	});
});
