export const ROUTE_CONSTANTS = {
	LOGIN: "auth/login",
	REGISTER: "auth/register",
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
};

export const APP_SETTINGS_CONSTANTS = {
	SHOP_CUT_STATUS: {
		UNPAID: { VALUE: 0, LABEL: "Unpaid" },
		PAID: { VALUE: 1, LABEL: "Paid" },
		RECEIVED: { VALUE: 2, LABEL: "Received" },
	},
	APPOINTMENT_TYPE: {
		SESSION: { VALUE: 0, LABEL: "Session" },
		CONSULT: { VALUE: 1, LABEL: "Consult" },
	},
	APPOINTMENT_STATUS: {
		COMPLETED: { VALUE: 0, LABEL: "Completed" },
		SCHEDULED: { VALUE: 1, LABEL: "Scheduled" },
		RESCHEDULED: { VALUE: 2, LABEL: "Rescheduled" },
		CANCELLED: { VALUE: 3, LABEL: "Cancelled" },
		NO_SHOW: { VALUE: 4, LABEL: "No Show" },
	},
	BILLING_TYPE: {
		HOURLY: { VALUE: 0, LABEL: "Hourly" },
		FLAT_RATE: { VALUE: 1, LABEL: "Flat Rate" },
	},
	NO_IMAGE_URL:
		"https://thumbs.dreamstime.com/b/tattoo-machine-icon-sign-symbol-design-tattoo-machine-icon-sign-symbol-149524394.jpg",
	LOADING_TEXT: "Loading...",
	ROUTE_NOT_FOUND_TEXT:
		"The page you're looking for does not exist.  Click anywhere on this card to go back.",
	SHOP_CUT_STATUS: {
		UNPAID: 2,
		PAID: 1,
		RECEIVED: 0,
	},
	APPOINTMENT_TYPE: {
		SESSION: 0,
		CONSULT: 1,
	},
	APPOINTMENT_STATUS: {
		COMPLETE: 0,
		SCHEDULED: 1,
		RESCHEDULED: 2,
		CANCELLED: 3,
		NO_SHOW: 4,
	},
	BILLING_TYPE: {
		HOURLY: 0,
		FLAT_RATE: 1,
	},
	PROJECT_STATUS: {
		OPEN: { VALUE: 0, LABEL: "Open" },
		IN_PROGRESS: { VALUE: 1, LABEL: "In Progress" },
		CANCELLED: { VALUE: 2, LABEL: "Cancelled" },
		CLOSED: { VALUE: 3, LABEL: "Closed" },
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
		ERROR: 'error',
		INFO: 'info',
		SUCCESS: 'success',
		WARNING: 'warning'
	},
	TIMEOUT: 5000,
};
