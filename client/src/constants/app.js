export const ROUTE_CONSTANTS = {
	LOGIN: "/login",
	REGISTER: "/register",
	USER: "users",
	HOME: "/",
	ARTISTS: "artists",
	ARTIST: "/artist/",
	EDIT_ARTIST: "/artist/edit/",
	CREATE_ARTIST: "artist/create",
	CLIENTS: "clients",
	CLIENT: "/client/",
	EDIT_CLIENT: "/client/edit/",
	CREATE_CLIENT: "/client/create",
	STAFF: "/staff/",
	STAFF_PROFILE: "/staff-profile/",
	EDIT_STAFF: "/staff/edit/",
	CREATE_STAFF: "/staff/create",
	PROJECTS: "projects",
	PROJECT: "/project/",
	EDIT_PROJECT: "/project/edit/",
	CREATE_PROJECT: "/project/create",
	SHOPS: "shops",
	SHOP: "/shop/",
	EDIT_SHOP: "/shop/edit/",
	CREATE_SHOP: "/shop/create",
	PROFILE: 'profile'
};

export const APP_SETTINGS_CONSTANTS = {
	GRAPHQL_SERVER_URL: 'http://localhost:5000/',
	SOCKET_IO_SERVER_URL: 'http://localhost:4000/',
	NO_IMAGE_URL:
		"https://thumbs.dreamstime.com/b/tattoo-machine-icon-sign-symbol-design-tattoo-machine-icon-sign-symbol-149524394.jpg",
	LOADING_TEXT: "Loading...",
	ROUTE_NOT_FOUND_TEXT:
		"The page you're looking for does not exist.  Click anywhere on this card to go back.",
	SHOP_CUT_STATUS: [
		{ value: 'unpaid', label: 'Unpaid' },
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
		{ value: 'cancelled', label: 'Cancelled'},
		{ value: 'completed', label: 'Completed'}
	],
	PROJECT_PALETTE_OPTIONS: [
		{ value: "black", label: "Black and Grey" },
		{ value: "color", label: "Color" },
	],
	PROJECT_IMAGE_TYPES: {
		REFERENCE: "reference",
		DESIGN: "design",
	},
	PAGE_TYPES: {
		ARTISTS: "artists",
		CLIENTS: "clients",
		STAFF: "staff",
		PROJECTS: "projects",
		APPOINTMENTS: "appointments",
		SHOPS: "shops",
		REPORTS: "reports",
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
	DATE_FORMAT: "MMM Do YYYY",
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
