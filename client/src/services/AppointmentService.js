import { gql, useQuery } from "@apollo/client";

export const AppointmentService = (() => {
    const _FETCH_APPOINTMENTS_BY_SHOP = gql`
        query GetAppointmentsByShop($shopId: ID!) {
            getAppointmentsByShop(shopId: $shopId) {
                id
                projectId
                userId
                project {
                    id
                    client {
                        id
                        user {
                            id
                            firstName
                            lastName
                            avatar
                        }
                    }
                    depositAmount
                }
                shopId
                user {
                    id
                    tagColor
                    lastName
                    firstName
                    avatar
                }
                title
                description
                appointmentType
                appointmentDate
                shopCutStatus
                shopCutAmount
                shopCutPaymentMethod
                shopCutSquareInvoiceId
            }
        }
    `;
    // skip when there's no shopId - an independent artist (no shop connection at all, a real
    // supported case, see PRODUCTION_ROADMAP.md's artist-centric tenancy section) has no shop
    // calendar to fetch. Without this, IBCalendar.jsx crashed outright trying to read
    // user.userInfo.shop.id before this even ran (see that file's own fix) - this guard is what
    // actually stops the query from firing with an undefined shopId against a resolver that
    // expects a real one.
    const _getAppointmentsByShop = (shopId) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_SHOP, {
			variables: {
				shopId,
			},
			skip: !shopId,
		});
    }

    // Used by ArtistPerformancePanel (see components/artistDashboard) to build both the "my
    // dashboard" self view and the shop's per-artist view - one artist's full appointment history
    // (any status, any date), with MTD/YTD revenue and shop-cut totals computed client-side rather
    // than added as new server aggregation resolvers for this first pass.
    const _FETCH_APPOINTMENTS_BY_ARTIST = gql`
        query GetAppointmentsByArtist($userId: ID!) {
            getAppointmentsByArtist(userId: $userId) {
                id
                title
                appointmentDate
                appointmentType
                appointmentStatus
                total
                tip
                shopCutStatus
                shopCutAmount
                shopId
                projectId
                project {
                    id
                    title
                }
            }
        }
    `;
    const _getAppointmentsByArtist = (userId) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_ARTIST, {
            variables: { userId },
            skip: !userId,
        });
    };

    // Same selection set as _FETCH_APPOINTMENTS_BY_SHOP above, just scoped to one artist via the
    // getAppointmentsByArtist resolver instead of getAppointmentsByShop - used by IBCalendar.jsx so
    // an independent (shop-less) artist gets a real calendar of their own appointments instead of
    // an empty one (see PRODUCTION_ROADMAP.md's "known gap" note on this). Deliberately a separate
    // query from _FETCH_APPOINTMENTS_BY_ARTIST above rather than widening it: that one is scoped
    // lean for ArtistPerformancePanel's dashboard use case and doesn't select the project/client/
    // user detail a calendar day cell needs to render an event (see ibCalendar/Day.jsx).
    const _FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR = gql`
        query GetAppointmentsByArtistForCalendar($userId: ID!) {
            getAppointmentsByArtist(userId: $userId) {
                id
                projectId
                userId
                project {
                    id
                    client {
                        id
                        user {
                            id
                            firstName
                            lastName
                            avatar
                        }
                    }
                    depositAmount
                }
                shopId
                user {
                    id
                    tagColor
                    lastName
                    firstName
                    avatar
                }
                title
                description
                appointmentType
                appointmentDate
                shopCutStatus
                shopCutAmount
                shopCutPaymentMethod
                shopCutSquareInvoiceId
            }
        }
    `;
    const _getAppointmentsByArtistForCalendar = (userId) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR, {
            variables: { userId },
            skip: !userId,
        });
    };

    const _CREATE_APPOINTMENT = gql`
        mutation CreateAppointment($appointmentInput: AppointmentInput) {
            createAppointment(appointmentInput: $appointmentInput) {
                projectId
                userId
                project {
                    id
                    designImages {
                        url
                    }
                }
                shopId
                user {
                    id
                    firstName
                    lastName
                    tagColor
                }
                title
                description
                appointmentType
                id
                appointmentDate
                shopCutStatus
                shopCutAmount
            }
        }
    `;

    const _UPDATE_APPOINTMENT = gql`
        mutation UpdateAppointment($appointmentInput: AppointmentInput) {
            updateAppointment(appointmentInput: $appointmentInput) {
                projectId
                project {
                    designImages {
                        url
                    }
                }
                shopId
                user {
                    id
                    firstName
                    lastName
                    tagColor
                }
                title
                description
                appointmentType
                id
                appointmentDate
                shopCutStatus
                shopCutAmount
                shopCutPaymentMethod
                shopCutSquareInvoiceId
            }
        }
    `;

    const _DELETE_APPOINTMENT = gql`
        mutation DeleteAppointment($appointmentId: ID) {
            deleteAppointment(appointmentId: $appointmentId)
            }
    `;

    // --- Shop-cut ledger ---
    // See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. createShopCutInvoice/
    // markShopCutPaidManually are called by the artist (see UpdateEventDialog); confirmShopCutPaid
    // is called by the shop side (see pages/shopCutConfirmations/ShopCutConfirmations.js).
    const _CREATE_SHOP_CUT_INVOICE = gql`
        mutation CreateShopCutInvoice($appointmentId: ID!, $paymentMethod: String) {
            createShopCutInvoice(appointmentId: $appointmentId, paymentMethod: $paymentMethod) {
                invoiceUrl
                appointment {
                    id
                    shopCutStatus
                    shopCutPaymentMethod
                    shopCutSquareInvoiceId
                }
            }
        }
    `;

    // Batch version of createShopCutInvoice - combines several completed sessions' shop cuts
    // into one Square invoice (see the artist-dashboard payout list, ShopCutPayoutList.jsx).
    const _CREATE_BATCH_SHOP_CUT_INVOICE = gql`
        mutation CreateBatchShopCutInvoice($appointmentIds: [ID!]!, $paymentMethod: String) {
            createBatchShopCutInvoice(appointmentIds: $appointmentIds, paymentMethod: $paymentMethod) {
                invoiceUrl
                appointments {
                    id
                    shopCutStatus
                    shopCutPaymentMethod
                    shopCutSquareInvoiceId
                }
            }
        }
    `;

    const _MARK_SHOP_CUT_PAID_MANUALLY = gql`
        mutation MarkShopCutPaidManually($appointmentId: ID!) {
            markShopCutPaidManually(appointmentId: $appointmentId) {
                id
                shopCutStatus
                shopCutPaymentMethod
                shopCutMarkedPaidAt
            }
        }
    `;

    const _CONFIRM_SHOP_CUT_PAID = gql`
        mutation ConfirmShopCutPaid($appointmentId: ID!) {
            confirmShopCutPaid(appointmentId: $appointmentId) {
                id
                shopCutStatus
                shopCutConfirmedAt
            }
        }
    `;

    const _FETCH_PENDING_SHOP_CUT_CONFIRMATIONS = gql`
        query GetPendingShopCutConfirmations($shopId: ID!) {
            getPendingShopCutConfirmations(shopId: $shopId) {
                id
                appointmentDate
                title
                shopCutAmount
                shopCutMarkedPaidAt
                user {
                    id
                    firstName
                    lastName
                    avatar
                }
            }
        }
    `;
    const _getPendingShopCutConfirmations = (shopId) => {
        return useQuery(_FETCH_PENDING_SHOP_CUT_CONFIRMATIONS, {
            variables: { shopId },
        });
    };

    // --- In-project session view ---
    // See PRODUCTION_ROADMAP.md's Phase 7 section and pages/projects/ProjectSessions.jsx. Every
    // session-type appointment tied to a project, so a Project page can list them and let the
    // artist click into one for the timer/notes/total detail view.
    const _FETCH_APPOINTMENTS_BY_PROJECT = gql`
        query GetAppointmentsByProject($projectId: ID!) {
            getAppointmentsByProject(projectId: $projectId) {
                id
                projectId
                userId
                shopId
                title
                description
                appointmentType
                appointmentDate
                appointmentStatus
                total
                tip
                timerStatus
                timerStartedAt
                accumulatedSeconds
                sessionNotes
            }
        }
    `;
    const _getAppointmentsByProject = (projectId) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_PROJECT, {
            variables: { projectId },
            skip: !projectId,
        });
    };

    // Shared selection set - all three timer mutations return the same fields the detail view
    // needs to keep ticking/re-render immediately without a separate refetch.
    const _SESSION_TIMER_FIELDS = `
        id
        timerStatus
        timerStartedAt
        accumulatedSeconds
    `;
    const _START_SESSION_TIMER = gql`
        mutation StartSessionTimer($appointmentId: ID!) {
            startSessionTimer(appointmentId: $appointmentId) {
                ${_SESSION_TIMER_FIELDS}
            }
        }
    `;
    const _STOP_SESSION_TIMER = gql`
        mutation StopSessionTimer($appointmentId: ID!) {
            stopSessionTimer(appointmentId: $appointmentId) {
                ${_SESSION_TIMER_FIELDS}
            }
        }
    `;
    const _RESET_SESSION_TIMER = gql`
        mutation ResetSessionTimer($appointmentId: ID!) {
            resetSessionTimer(appointmentId: $appointmentId) {
                ${_SESSION_TIMER_FIELDS}
            }
        }
    `;

    // Minimal-payload update, matching what updateAppointmentInputSchema actually requires (id +
    // appointmentDate) plus only the fields the session detail view can change - total,
    // sessionNotes, appointmentStatus (for "close session"). Deliberately not the same
    // full-object-replace shape UpdateEventDialog uses, since this view never touches shopCut*/
    // title/description/etc and re-sending stale copies of those is unnecessary risk.
    const _UPDATE_SESSION_DETAILS = gql`
        mutation UpdateSessionDetails($appointmentInput: AppointmentInput) {
            updateAppointment(appointmentInput: $appointmentInput) {
                id
                total
                sessionNotes
                appointmentStatus
            }
        }
    `;

    return {
        FETCH_APPOINTMENTS_BY_SHOP: _FETCH_APPOINTMENTS_BY_SHOP,
        FETCH_APPOINTMENTS_BY_ARTIST: _FETCH_APPOINTMENTS_BY_ARTIST,
        FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR: _FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR,
        getAppointmentsByArtist: _getAppointmentsByArtist,
        getAppointmentsByArtistForCalendar: _getAppointmentsByArtistForCalendar,
        CREATE_APPOINTMENT: _CREATE_APPOINTMENT,
        UPDATE_APPOINTMENT: _UPDATE_APPOINTMENT,
        DELETE_APPOINTMENT: _DELETE_APPOINTMENT,
        CREATE_SHOP_CUT_INVOICE: _CREATE_SHOP_CUT_INVOICE,
        CREATE_BATCH_SHOP_CUT_INVOICE: _CREATE_BATCH_SHOP_CUT_INVOICE,
        MARK_SHOP_CUT_PAID_MANUALLY: _MARK_SHOP_CUT_PAID_MANUALLY,
        CONFIRM_SHOP_CUT_PAID: _CONFIRM_SHOP_CUT_PAID,
        getAppointmentsByShop: _getAppointmentsByShop,
        getPendingShopCutConfirmations: _getPendingShopCutConfirmations,
        getAppointmentsByProject: _getAppointmentsByProject,
        START_SESSION_TIMER: _START_SESSION_TIMER,
        STOP_SESSION_TIMER: _STOP_SESSION_TIMER,
        RESET_SESSION_TIMER: _RESET_SESSION_TIMER,
        UPDATE_SESSION_DETAILS: _UPDATE_SESSION_DETAILS,
    }

})();