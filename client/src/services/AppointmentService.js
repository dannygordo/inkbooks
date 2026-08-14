import { gql, useQuery, useLazyQuery } from "@apollo/client";
import { getOperationName } from "@apollo/client/utilities";
import { rangeToFilterBounds } from "../utils/dateRanges";

export const AppointmentService = (() => {
    // Takes the month the calendar is actually showing. This used to fetch a shop's ENTIRE
    // appointment history so Day.jsx could filter it down to one day - see
    // server/utils/pagination.js. limit is deliberately high rather than paged: a month is a
    // bounded set the calendar has to render all of at once, so paging it would just mean
    // stitching pages back together in the browser.
    const _FETCH_APPOINTMENTS_BY_SHOP = gql`
        query GetAppointmentsByShop($shopId: ID!, $filter: AppointmentFilter, $page: PageInput) {
            getAppointmentsByShop(shopId: $shopId, filter: $filter, page: $page) {
              items {
                id
                projectId
                userId
                bookingRequestId
                project {
                    id
                    title
                    client {
                        id
                        user {
                            id
                            firstName
                            lastName
                            avatar
                        }
                    }
                    depositCollectedCents
                }
                # A consult has no project yet (see models/Appointment.js), so its client only
                # exists via the original booking request - same fallback AppointmentsList.jsx's
                # row already needs, kept minimal (just the name) since this list only displays it.
                bookingRequest {
                    id
                    client {
                        id
                        firstName
                        lastName
                    }
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
                durationMinutes
                appointmentEnd
                appointmentStatus
                # Needed so the shop-wide dashboard (ArtistPerformancePanel's shopWide mode, see
                # components/artistDashboard) can show a completed session's earnings the same way
                # the single-artist dashboard already does via _FETCH_APPOINTMENTS_BY_ARTIST -
                # AppointmentsList.jsx itself doesn't render either, but selecting them here costs
                # nothing extra on that request.
                totalCents
                tipCents
                shopCutStatus
                shopCutCents
                shopCutPaymentMethod
                shopCutSquareInvoiceId
            }
              pageInfo { totalCount hasMore limit offset }
            }
        }
    `;
    // skip when there's no shopId - an independent artist (no shop connection at all, a real
    // supported case, see PRODUCTION_ROADMAP.md's artist-centric tenancy section) has no shop
    // calendar to fetch. Without this, IBCalendar.jsx crashed outright trying to read
    // user.userInfo.shop.id before this even ran (see that file's own fix) - this guard is what
    // actually stops the query from firing with an undefined shopId against a resolver that
    // expects a real one.
    // range is { from, to } covering exactly the grid the calendar is drawing - see
    // IBCalendar.jsx. Skipped without one as well as without a shopId: firing this unbounded
    // would fetch the shop's whole history, which is the thing the range exists to stop.
    const _getAppointmentsByShop = (shopId, range, page) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_SHOP, {
			variables: {
				shopId,
				filter: range,
				// A month of one shop's appointments, in one response, when no page is asked for.
				// Paging the CALENDAR would just mean stitching the pages back together in the
				// browser to draw the grid - but a list over an arbitrary range genuinely needs to
				// page, so callers can now say so.
				page: page || { limit: 200 },
			},
			skip: !shopId || !range,
		});
    }

    // Used by ArtistPerformancePanel (see components/artistDashboard) to build both the "my
    // dashboard" self view and the shop's per-artist view - one artist's full appointment history
    // (any status, any date), with MTD/YTD revenue and shop-cut totals computed client-side rather
    // than added as new server aggregation resolvers for this first pass.
    const _FETCH_APPOINTMENTS_BY_ARTIST = gql`
        query GetAppointmentsByArtist($userId: ID!, $filter: AppointmentFilter, $page: PageInput) {
            getAppointmentsByArtist(userId: $userId, filter: $filter, page: $page) {
              items {
                id
                title
                appointmentDate
                durationMinutes
                appointmentEnd
                appointmentType
                appointmentStatus
                subtotalCents
                taxCents
                feeCents
                tipCents
                totalCents
                shopCutStatus
                shopCutCents
                shopId
                projectId
                bookingRequestId
                # Added for the dashboard's row tinting - every list showing artist data colours
                # its rows by the artist's tagColor (see utils/tagColor.js). Selected here rather
                # than derived client-side from the logged-in user, because this panel is also
                # mounted on Artist.jsx showing someone ELSE's appointments - the colour has to
                # belong to the appointment's own artist, not the viewer.
                user {
                    id
                    tagColor
                }
                project {
                    id
                    title
                    client {
                        id
                        user {
                            id
                            firstName
                            lastName
                        }
                    }
                }
                # A consult has no project yet (see models/Appointment.js) - same fallback
                # AppointmentsList.jsx's row already uses, for the same reason.
                bookingRequest {
                    id
                    client {
                        id
                        firstName
                        lastName
                    }
                }
            }
              pageInfo { totalCount hasMore limit offset }
            }
        }
    `;
    // fetchPolicy: 'cache-and-network' - was left at Apollo's default 'cache-first'. This is a
    // dashboard: an artist converting a consult to a session (ConsultDetail.jsx/
    // BookSessionDatesForm.jsx), adding an extra session from a project
    // (ProjectSessionsList.jsx), or creating one from the calendar wizard all land the new
    // Appointment via mutations that have no reason to know this specific cached list query
    // exists, let alone update it - so with 'cache-first', navigating to the dashboard right
    // after any of those just re-served the stale array Apollo already had cached from the last
    // time this query ran, and the new appointment was missing until a full page reload reset
    // the in-memory cache entirely. 'cache-and-network' still shows the cached list instantly (no
    // loading flash on a normal visit) but always fires a real network request behind it too, so
    // a dashboard visit is guaranteed to reflect whatever was created elsewhere in the same
    // session.
    // Three narrow calls replace one fat one. The dashboard used to fetch an artist's ENTIRE
    // career and run four client-side passes over it - upcoming, recently completed, payout
    // candidates, plus the calendar's own filter - which meant every dashboard visit downloaded
    // every appointment that artist had ever had. Each of these now asks the server the question
    // the screen is actually asking. See server/graphql/typeDefs.js's AppointmentFilter.
    // BOTH TAKE THE RANGE NOW. They used to ignore it, so clicking "Last month" on the dashboard
    // moved every figure and left both lists showing August - the filter said one thing and the
    // rows said another, which is worse than no filter at all.
    //
    // An empty list is an acceptable answer. "No completed sessions last month" is information; a
    // list that quietly ignores the control above it is not.
    // limit/offset instead of a bare limit - was fixed at "the first 5, always" with no way to see
    // the sixth. pageInfo was already coming back on every response (this reuses
    // _FETCH_APPOINTMENTS_BY_ARTIST, same as the calendar), it just wasn't being read by anything.
    const _getUpcomingAppointments = (userId, limit = 5, range, offset = 0) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_ARTIST, {
            variables: {
                userId,
                // upcomingOnly AND the range, which the resolver intersects rather than letting one
                // overwrite the other - "upcoming" is still ahead of now, but never outside the
                // window that was asked for. A past range therefore returns nothing, correctly:
                // there are no upcoming appointments in July.
                filter: { upcomingOnly: true, ...rangeToFilterBounds(range) },
                page: { limit, offset },
            },
            skip: !userId,
            fetchPolicy: "cache-and-network",
        });
    };

    const _getCompletedAppointments = (userId, limit = 5, range, offset = 0) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_ARTIST, {
            variables: {
                userId,
                filter: { appointmentStatus: "completed", ...rangeToFilterBounds(range) },
                page: { limit, offset },
            },
            skip: !userId,
            fetchPolicy: "cache-and-network",
        });
    };

    // The shop-wide counterparts to the two above - every artist's appointments at a shop rather
    // than one artist's own, for ArtistPerformancePanel's shopWide mode (a shop admin's own
    // dashboard, once they have a shop - see that component). Reuses _FETCH_APPOINTMENTS_BY_SHOP
    // (same query AppointmentsList.jsx runs) rather than inventing a fourth document: it already
    // carries client name, appointmentStatus and per-artist tagColor, which is exactly what a
    // multi-artist list needs and a single-artist one didn't.
    const _getUpcomingAppointmentsForShop = (shopId, limit = 5, range, offset = 0) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_SHOP, {
            variables: {
                shopId,
                filter: { upcomingOnly: true, ...rangeToFilterBounds(range) },
                page: { limit, offset },
            },
            skip: !shopId,
            fetchPolicy: "cache-and-network",
        });
    };

    const _getCompletedAppointmentsForShop = (shopId, limit = 5, range, offset = 0) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_SHOP, {
            variables: {
                shopId,
                filter: { appointmentStatus: "completed", ...rangeToFilterBounds(range) },
                page: { limit, offset },
            },
            skip: !shopId,
            fetchPolicy: "cache-and-network",
        });
    };

    // project/status/client added for the payout list's own fields (project title, project
    // status, client name) - previously this query didn't select a project at all. bookingRequest
    // is deliberately NOT selected here the way the appointments-list queries do: a shop cut is
    // only ever assessed on a session's subtotal (see DECISIONS.md M2), and a session always has a
    // project by the time it reaches 'completed' - there's no consult-shaped row in this list to
    // fall back for.
    const _FETCH_SHOP_CUT_PAYOUT_CANDIDATES = gql`
        query GetShopCutPayoutCandidates($userId: ID!, $filter: AppointmentFilter) {
            getShopCutPayoutCandidates(userId: $userId, filter: $filter) {
                id
                title
                appointmentDate
                durationMinutes
                appointmentEnd
                appointmentStatus
                totalCents
                subtotalCents
                shopId
                shopCutStatus
                shopCutCents
                shopCutPaymentMethod
                shopCutSquareInvoiceId
                userId
                user { id firstName lastName tagColor }
                projectId
                project {
                    id
                    title
                    status
                    client {
                        id
                        user {
                            id
                            firstName
                            lastName
                        }
                    }
                }
            }
        }
    `;

    // Everything owed IN THE SELECTED RANGE, unpaginated on purpose - the task is settling a
    // debt, and a batch "invoice all" over a paged list is ambiguous about what it covers. See
    // typeDefs.js. range is optional (rangeToFilterBounds(undefined) is just {}, same as passing
    // no filter at all) - was unconditionally unbounded regardless of the dashboard's own date
    // range picker, which every OTHER section on the panel already honoured; "This Month" doing
    // nothing to this one list read as the control being broken rather than as a deliberate
    // "debts don't expire" choice, so it's range-scoped now like everything else.
    const _getShopCutPayoutCandidates = (userId, range) => {
        return useQuery(_FETCH_SHOP_CUT_PAYOUT_CANDIDATES, {
            variables: { userId, filter: rangeToFilterBounds(range) },
            skip: !userId,
            fetchPolicy: "cache-and-network",
        });
    };

    // Same selection set, scoped to a shop instead of one artist - see
    // getShopCutPayoutCandidatesByShop in typeDefs.js/resolvers/appointments.js. Shop-admin-only
    // on the server; ArtistPerformancePanel only ever calls this in its shopWide branch.
    const _FETCH_SHOP_CUT_PAYOUT_CANDIDATES_BY_SHOP = gql`
        query GetShopCutPayoutCandidatesByShop($shopId: ID!, $filter: AppointmentFilter) {
            getShopCutPayoutCandidatesByShop(shopId: $shopId, filter: $filter) {
                id
                title
                appointmentDate
                durationMinutes
                appointmentEnd
                appointmentStatus
                totalCents
                subtotalCents
                shopId
                shopCutStatus
                shopCutCents
                shopCutPaymentMethod
                shopCutSquareInvoiceId
                userId
                user { id firstName lastName tagColor }
                projectId
                project {
                    id
                    title
                    status
                    client {
                        id
                        user {
                            id
                            firstName
                            lastName
                        }
                    }
                }
            }
        }
    `;
    const _getShopCutPayoutCandidatesByShop = (shopId, range) => {
        return useQuery(_FETCH_SHOP_CUT_PAYOUT_CANDIDATES_BY_SHOP, {
            variables: { shopId, filter: rangeToFilterBounds(range) },
            skip: !shopId,
            fetchPolicy: "cache-and-network",
        });
    };

    const _getAppointmentsByArtist = (userId) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_ARTIST, {
            variables: { userId },
            skip: !userId,
            fetchPolicy: "cache-and-network",
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
        query GetAppointmentsByArtistForCalendar($userId: ID!, $filter: AppointmentFilter, $page: PageInput) {
            getAppointmentsByArtist(userId: $userId, filter: $filter, page: $page) {
              items {
                id
                projectId
                userId
                bookingRequestId
                project {
                    id
                    title
                    client {
                        id
                        user {
                            id
                            firstName
                            lastName
                            avatar
                        }
                    }
                    depositCollectedCents
                }
                # Same consult fallback as _FETCH_APPOINTMENTS_BY_SHOP above - see its comment.
                bookingRequest {
                    id
                    client {
                        id
                        firstName
                        lastName
                    }
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
                durationMinutes
                appointmentEnd
                appointmentStatus
                shopCutStatus
                shopCutCents
                shopCutPaymentMethod
                shopCutSquareInvoiceId
            }
              pageInfo { totalCount hasMore limit offset }
            }
        }
    `;
    // page is optional: the calendar wants one month in one response and passes nothing, the
    // appointments list drives real paging through it. Defaulting here rather than at each call
    // site keeps the calendar's "give me the grid" behaviour unchanged while letting a list ask
    // for a window it can page through.
    const _getAppointmentsByArtistForCalendar = (userId, range, page) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR, {
            variables: { userId, filter: range, page: page || { limit: 200 } },
            skip: !userId || !range,
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
                durationMinutes
                appointmentEnd
                shopCutStatus
                shopCutCents
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
                durationMinutes
                appointmentEnd
                shopCutStatus
                shopCutCents
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
                durationMinutes
                appointmentEnd
                title
                shopCutCents
                shopCutMarkedPaidAt
                user {
                    id
                    firstName
                    lastName
                    avatar
                    # This is the one list in the app that is genuinely multi-artist - a shop's
                    # inbox of every artist's manual mark-paid claims - so the row colour actually
                    # distinguishes rows here rather than just restating whose page you're on.
                    tagColor
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
                durationMinutes
                appointmentEnd
                appointmentStatus
                subtotalCents
                taxCents
                feeCents
                tipCents
                totalCents
                # SessionDetail renders the computed cut back to the artist, so they can see what
                # a given session actually costs them before closing it.
                shopCutCents
                shopCutStatus
                shopCutPercentApplied
                # Deposits - both sides. depositCents/depositStatus describe a deposit this
                # appointment COLLECTED; depositCreditCents describes one applied TO it.
                depositCents
                depositStatus
                depositCreditCents
                depositCreditFromAppointmentId
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

    // --- Consult detail view ---
    // A consult has no Project of its own to view/edit through (see ConsultDetail.jsx) - this
    // single-appointment query is what that page uses instead, pulling the original intake
    // details back via the bookingRequest field resolver (see resolvers/index.js's
    // Appointment.bookingRequest) rather than duplicating that data onto Appointment itself.
    const _FETCH_APPOINTMENT = gql`
        query GetAppointment($appointmentId: ID!) {
            getAppointment(appointmentId: $appointmentId) {
                id
                title
                description
                appointmentType
                appointmentDate
                durationMinutes
                appointmentEnd
                appointmentStatus
                projectId
                bookingRequestId
                bookingRequest {
                    id
                    status
                    description
                    placement
                    size
                    budget
                    isCoverUp
                    referenceImages
                    client {
                        id
                        firstName
                        lastName
                        email
                        phone
                    }
                }
            }
        }
    `;
    // `options` exists for UpdateEventDialog, which needs to skip this on top of the id check:
    // it opens for every appointment type, but only a consult has a bookingRequest worth fetching.
    // A hook can't be called conditionally, so "don't run this for sessions" has to be expressed
    // as a skip rather than an if - otherwise every session click on the calendar would pay for a
    // round trip whose entire result it ignores.
    const _getAppointment = (appointmentId, options = {}) => {
        return useQuery(_FETCH_APPOINTMENT, {
            variables: { appointmentId },
            ...options,
            skip: !appointmentId || options.skip,
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
    // appointmentDate added to the return selection (was id/total/sessionNotes/appointmentStatus
    // only) - SessionDetail.jsx now lets the date/time itself be edited from this view, and needs
    // the saved value back to update its local state without a separate refetch.
    const _UPDATE_SESSION_DETAILS = gql`
        mutation UpdateSessionDetails($appointmentInput: AppointmentInput) {
            updateAppointment(appointmentInput: $appointmentInput) {
                id
                appointmentDate
                durationMinutes
                appointmentEnd
                subtotalCents
                tipCents
                totalCents
                # Returned so the view can reflect the recomputed cut immediately - changing
                # subtotalCents re-derives it server-side (see mutations/appointments.js), and
                # without these the UI would keep showing the pre-save figure until a refetch.
                shopCutCents
                shopCutStatus
                sessionNotes
                appointmentStatus
            }
        }
    `;

    // What charging a session would come to, computed SERVER-SIDE by the same function the charge
    // route uses (server/utils/charge-quote.js). Lazy, because it is asked at the moment the
    // artist reaches for a card rather than on every render of a session.
    //
    // The client no longer adds these up. It used to: SessionDetail summed subtotal + tax + fee +
    // tip and posted the components alongside the charge, and the server wrote them down and
    // computed the shop's cut from them. A total agreed on screen and a different total leaving
    // the card is a disagreement nothing in the system can settle afterwards.
    const _GET_CHARGE_QUOTE = gql`
        query GetChargeQuote(
            $appointmentId: ID!
            $applyFeeOffset: Boolean
            $tipCents: Int
            $subtotalCentsOverride: Int
        ) {
            getChargeQuote(
                appointmentId: $appointmentId
                applyFeeOffset: $applyFeeOffset
                tipCents: $tipCents
                subtotalCentsOverride: $subtotalCentsOverride
            ) {
                subtotalCents
                depositCreditCents
                netSubtotalCents
                feeOffsetCents
                taxableCents
                taxCents
                tipCents
                totalCents
                giftCardCents
                amountDueCents
                source
                canCharge
            }
        }
    `;

    const _useChargeQuote = () => useLazyQuery(_GET_CHARGE_QUOTE, { fetchPolicy: "network-only" });

    /**
     * Every query that draws appointments, by operation name - to hand to a mutation's
     * `refetchQueries` after anything that creates, moves or removes one.
     *
     * BY NAME, and ALL of them, deliberately.
     *
     * By name because the object form (`{ query, variables }`) refetches the query with exactly
     * the variables given, and those variables have to stay in lockstep with whatever the
     * watching component happens to be passing. AppointmentWizard did this and passed
     * `{ shopId }`, which matched the calendar's watch right up until these queries gained
     * `filter` and `page`. After that it fired a real request whose result landed in the cache
     * under a key nothing was watching - so saving an appointment did nothing visible until a
     * hard reload. A name has no variables to drift.
     *
     * All of them because `refetchQueries` only touches queries that are currently ACTIVE.
     * Naming one that isn't mounted costs nothing - no request is made - so there is no reason
     * for a caller to work out which calendar or dashboard the user is looking at. That
     * branching was itself a place to be wrong: an appointment created from the calendar also
     * belongs in the artist's "upcoming" list, and the wizard's shopId-or-userId ternary could
     * only ever refresh one of the two.
     *
     * Read off the documents rather than written as literals, so renaming an operation can't
     * leave a string here pointing at nothing.
     */
    const _CALENDAR_REFETCH_QUERIES = [
        _FETCH_APPOINTMENTS_BY_SHOP,
        _FETCH_APPOINTMENTS_BY_ARTIST,
        _FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR,
    ].map(getOperationName);

    return {
        CALENDAR_REFETCH_QUERIES: _CALENDAR_REFETCH_QUERIES,
        FETCH_APPOINTMENTS_BY_SHOP: _FETCH_APPOINTMENTS_BY_SHOP,
        FETCH_APPOINTMENTS_BY_ARTIST: _FETCH_APPOINTMENTS_BY_ARTIST,
        FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR: _FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR,
        getAppointmentsByArtist: _getAppointmentsByArtist,
        getUpcomingAppointments: _getUpcomingAppointments,
        getCompletedAppointments: _getCompletedAppointments,
        getUpcomingAppointmentsForShop: _getUpcomingAppointmentsForShop,
        getCompletedAppointmentsForShop: _getCompletedAppointmentsForShop,
        getShopCutPayoutCandidates: _getShopCutPayoutCandidates,
        getShopCutPayoutCandidatesByShop: _getShopCutPayoutCandidatesByShop,
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
        GET_CHARGE_QUOTE: _GET_CHARGE_QUOTE,
        useChargeQuote: _useChargeQuote,
        getAppointment: _getAppointment,
        // Exported so tests can build a MockedProvider mock against the same document the
        // component actually runs - mirroring it by hand in a test file is how a query and its
        // mock silently drift apart.
        FETCH_APPOINTMENT: _FETCH_APPOINTMENT,
    }

})();