export const ROUTE_CONSTANTS = {
	LOGIN: "/login",
	// Public. The logged-out reset request form, and where an emailed invite/reset link lands.
	RESET_PASSWORD: "/resetPassword",
	SET_PASSWORD: "/set-password/",
	REGISTER: "/register",
	USER: "users",
	HOME: "/",
	ARTISTS: "artists",
	ARTIST: "/artist/",
	// EDIT_ARTIST removed alongside its route - same reasoning as EDIT_PROJECT below. Every field
	// EditArtist.jsx offered is now editable in place on Artist.jsx itself. See App.jsx.
	CREATE_ARTIST: "artist/create",
	CLIENTS: "clients",
	CLIENT: "/client/",
	// EDIT_CLIENT removed alongside its route - same reasoning as EDIT_PROJECT below. Every field
	// EditClient.jsx offered is now editable in place on Client.jsx itself. See App.jsx.
	CREATE_CLIENT: "/client/create",
	STAFF: "/staff/",
	STAFF_PROFILE: "/staff-profile/",
	// EDIT_STAFF removed alongside its route - same reasoning as EDIT_PROJECT below. Every field
	// EditStaff.jsx offered is now editable in place on StaffProfile.jsx itself. See App.jsx.
	CREATE_STAFF: "/staff/create",
	PROJECTS: "projects",
	PROJECT: "/project/",
	// EDIT_PROJECT removed alongside its route - nothing ever navigated to it, and the route it
	// named rendered the client edit form. See App.jsx.
	CREATE_PROJECT: "/project/create",
	// A consult has no Project of its own to view/edit through - see ConsultDetail.jsx.
	CONSULT: "/consult/",
	SHOPS: "shops",
	SHOP: "/shop/",
	// EDIT_SHOP removed alongside its route - same reasoning as EDIT_PROJECT above. Every field
	// EditShop.jsx offered is now editable in place on Shop.jsx itself. See App.jsx.
	CREATE_SHOP: "/shop/create",
	// PROFILE is gone along with the page it named. Its avatar, password and calendar colour are
	// panels on Settings now - see components/settings/AccountPanel.jsx. It was also written
	// 'profile', with no leading slash, unlike every other absolute route here: navigate('profile')
	// resolves RELATIVE to wherever you already are, so it only ever landed correctly from the root.
	SETTINGS: '/settings',
	EXPENSES: '/expenses',
	INCOME: '/income',
	FORMS: '/forms',
	FORM: '/forms/',
	// Public, unauthenticated - same shape as /book/:artistHandle. A guest link is
	// /form/:publicToken (singular "form", not "forms"), so it can never collide with the
	// authenticated management list's own /forms/:formId route above.
	PUBLIC_FORM: '/form/'
};

export const APP_SETTINGS_CONSTANTS = {
	PRODUCTION: {
		// Backend lives on a separate host (Render/Railway) at the api.inkbooks.net subdomain,
		// not on the same domain as the frontend - and must be https:// or the browser blocks
		// it as mixed content once the frontend itself is served over https (Netlify enforces
		// this by default).
		GRAPHQL_SERVER_URL: 'https://api.inkbooks.net/',
		SOCKET_IO_SERVER_URL: 'https://api.inkbooks.net/',
	},
	DEVELOPMENT: {
		GRAPHQL_SERVER_URL: 'http://localhost:5500/',
		// Was port 4000 - socket.io no longer has its own listener, it is attached to the
		// same Express/HTTP server as GraphQL now, so both use port 5500.
		SOCKET_IO_SERVER_URL: 'http://localhost:5500/',
	},
	NO_IMAGE_URL:
		"https://thumbs.dreamstime.com/b/tattoo-machine-icon-sign-symbol-design-tattoo-machine-icon-sign-symbol-149524394.jpg",
	LOADING_TEXT: "Loading...",
	ROUTE_NOT_FOUND_TEXT:
		"The page you're looking for does not exist.  Click anywhere on this card to go back.",
	// Was missing 'none'/'invoice_sent'/'pending_confirmation' - only had the 3 oldest values,
	// out of sync with the real enum on Appointment.shopCutStatus (see models/Appointment.js's
	// own comment on the full lifecycle) ever since the Square-invoice/manual-confirm flow was
	// added. Wasn't actually wired to any dropdown anywhere (grepped the whole client - dead
	// until now), but worth having correct for whatever reads it next rather than leaving a
	// stale enum sitting in constants as a trap.
	SHOP_CUT_STATUS: [
		{ value: 'none', label: 'No shop cut owed' },
		{ value: 'unpaid', label: 'Unpaid' },
		{ value: 'invoice_sent', label: 'Invoice sent - awaiting payment' },
		{ value: 'pending_confirmation', label: 'Marked paid - awaiting shop confirmation' },
		{ value: 'paid', label: 'Paid' },
		{ value: 'received', label: 'Received' }
	],
	APPOINTMENT_TYPE: [
		{ value: 'consult', label: 'Consult' },
		{ value: 'session', label: 'Session' },
		{ value: 'other', label: 'Other' }
	],
	APPOINTMENT_STATUS: [
		{ value: 'scheduled', label: 'Scheduled' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'rescheduled', label: 'Rescheduled' },
		{ value: 'cancelled', label: 'Cancelled' },
		{ value: 'no_show', label: 'No Show' },
	],
	BILLING_TYPE: [
		{ value: 'hourly', label: 'Hourly' },
		{ value: 'flat_rate', label: 'Flat Rate' }
	],
	PROJECT_STATUS: [
		{ value: 'open', label: 'Open'},
		{ value: 'in_progress', label: 'In Progress'},
		{ value: 'waitlist', label: 'Waitlist'},
		{ value: 'cancelled', label: 'Cancelled'},
		{ value: 'completed', label: 'Completed'}
	],
	PROJECT_PALETTE_OPTIONS: [
		{ value: "black", label: "Black and Grey" },
		{ value: "color", label: "Color" },
	],
	// Mirrors server/models/Form.js's FORM_FIELD_TYPES exactly - same 7 values, same order. Kept as
	// a flat, hand-copied list rather than read off a GraphQL enum: this app has no other client-
	// side enum sourced from the schema (see e.g. APPOINTMENT_STATUS above, PROJECT_STATUS below),
	// so introducing that pattern for one feature would be its own new thing to keep in sync.
	// 'signature' is a TYPED signature (full name, server-set timestamp) - NOT a drawn/canvas pad,
	// see Form.js's own comment and HANDOFF.md for why that's deliberately deferred.
	FORM_FIELD_TYPES: [
		{ value: "short_text", label: "Short answer" },
		{ value: "paragraph", label: "Paragraph" },
		{ value: "single_choice", label: "Single choice" },
		{ value: "multi_choice", label: "Multiple choice" },
		{ value: "date", label: "Date" },
		{ value: "file_upload", label: "File upload" },
		{ value: "signature", label: "Signature (typed)" },
	],
	FORM_CHOICE_FIELD_TYPES: ["single_choice", "multi_choice"],
	FORM_STATUSES: [
		{ value: "draft", label: "Draft" },
		{ value: "published", label: "Published" },
		{ value: "archived", label: "Archived" },
	],
	TAG_COLORS: [
		{ value: '#c69818', label: 'Goldfinger' },
		{ value: '#861d15', label: 'Brick Red' },
		{ value: '#122152', label: 'Deep Blue' },
		{ value: '#2ea2dc', label: 'Robin Blue' },
		{ value: '#8E24AA', label: 'Royal Purple' },
		{ value: '#e1591f', label: 'Pumpkin' },
		{ value: '#e2d355', label: 'Banana' },
		{ value: '#4c4b40', label: 'Olive Green' },
		{ value: '#73f0b6', label: 'Seafoam' },
		{ value: '#90674a', label: 'Mocha' },
		{ value: '#bdc647', label: 'Tennis Ball' },
		{ value: '#84b100', label: 'Bright Green' },
		{ value: '#f49198', label: 'Pink' },
		{ value: '#d9a6f5', label: 'Lavander' },
		{ value: '#c57b00', label: 'Terracotta' },
	],
	PROJECT_IMAGE_TYPES: {
		REFERENCE: "reference",
		DESIGN: "design",
		BODY: "body",
	},
	PAGE_TYPES: {
		ARTISTS: "artists",
		CLIENTS: "clients",
		STAFF: "staff",
		PROJECTS: "projects",
		APPOINTMENTS: "appointments",
		SHOPS: "shops",
		// REPORTS removed with the page - see App.jsx.
	},
	CARD_TYPES: {
		ARTIST: "artist",
		CLIENT: "client",
		STAFF: "staff",
		PROJECT: "project",
		APPOINTMENT: "appointment",
		SHOP: "shop",
		REPORT: "report",
		ERROR: "error",
		ROUTE_NOT_FOUND: "routenotfound",
	},
	DATE_FORMAT: "MMM Do YYYY"
};

export const ALERT_CONSTANTS = {
	DISPLAY_MAIN_PAGE: "main",
	DISPLAY_MODAL: "modal",
	SEVERITY: {
		ERROR: "error",
		INFO: "info",
		SUCCESS: "success",
		WARNING: "warning",
	},
	TIMEOUT: 3000,
};
