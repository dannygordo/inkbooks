import { Delete, Update, OpenInNew, EventAvailable } from "@mui/icons-material";
import { DialogActions, DialogContent } from "@mui/material";
import moment from "moment";
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ALERT_CONSTANTS, APP_SETTINGS_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import AppointmentSlotPicker from "../appointments/AppointmentSlotPicker";
import {
	CONSULT_DEFAULT_MINUTES,
	SESSION_DEFAULT_MINUTES,
} from "../appointments/DurationPicker";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
import BookSessionDatesForm from "../booking/BookSessionDatesForm";
import { useAuth } from "../../context/auth";
import { useMutation } from "@apollo/client";
import { AppointmentService } from "../../services/AppointmentService";
import UtilsService from "../../services/UtilsService";

/**
 * Appointment type and project are LABELS here, not inputs.
 *
 * Both used to be editable dropdowns, from back when this dialog was the only way an appointment
 * got its type and project at all. AppointmentWizard.jsx now owns that decision at creation time,
 * and it isn't a free-form choice: the wizard branches on type (a consult collects intake details
 * and has no Project; a session is bound to a specific Project, either new or existing) and
 * convertBookingRequest wires the resulting Appointment to its BookingRequest accordingly. Letting
 * someone flip 'session' to 'consult', or repoint an appointment at an unrelated project, from a
 * quick-edit dialog would silently break those invariants - the appointment would keep its
 * bookingRequestId, its Project's sessions list, and its shop-cut ledger entry while claiming to be
 * something else entirely. Changing either is a different, deliberate operation than "fix the time
 * or fix a typo in the title", which is all this dialog is for.
 *
 * Removing the project dropdown also removed this component's only reason to run
 * ProjectService.fetchProjectsByArtist(user.id) - the project's title comes straight off
 * event.project, which the calendar's own query already fetches (see AppointmentService's
 * _FETCH_APPOINTMENTS_BY_SHOP). That drops a whole network round-trip and the loading gate that
 * came with it, so the dialog now renders immediately instead of flashing a spinner.
 */
const UpdateEventDialog = ({ selectedDay, event }) => {
	const { setModal, modal, user, setAlert } = useAuth();
	const navigate = useNavigate();
	const titleRef = useRef(event.title);
	const descriptionRef = useRef(event.description);
	// LOCAL, not moment.utc(). A utc-mode moment makes the picker interpret whatever the artist
	// picks as a UTC wall clock, so "10:00" is stored as 10:00Z - seven hours early in PDT. The
	// appointment is an INSTANT; the picker works in the viewer's zone and toISOString() converts.
	const [startDateTime, setStartDateTime] = useState(moment(event.appointmentDate));
	// Seeded from the stored value, falling back for records written before durationMinutes
	// existed - the server resolver has the same fallback, so this only matters until a re-seed.
	const [durationMinutes, setDurationMinutes] = useState(
		event.durationMinutes ||
			(event.appointmentType === "session" ? SESSION_DEFAULT_MINUTES : CONSULT_DEFAULT_MINUTES)
	);
	const [showConvertForm, setShowConvertForm] = useState(false);
    const [updateAppointment] = useMutation(AppointmentService.UPDATE_APPOINTMENT);
    const [deleteAppointment] = useMutation(AppointmentService.DELETE_APPOINTMENT);

    const isConsult = event.appointmentType === "consult";

    // Only a consult needs this. The calendar's own query (_FETCH_APPOINTMENTS_BY_SHOP) carries
    // bookingRequestId but not the BookingRequest itself, and adding it there would mean one extra
    // findById per appointment on every month render - a real cost paid by every session and
    // "other" appointment on the calendar for data only a consult's Convert action reads.
    // Fetched here instead, skipped entirely for anything that isn't a consult.
    const { data: consultData } = AppointmentService.getAppointment(event.id, {
        skip: !isConsult,
    });
    const bookingRequest = consultData?.getAppointment?.bookingRequest;
    // Same gate ConsultDetail.jsx uses: a request that has already moved to session_booked has
    // nothing left to convert, and one at any other status was never a booked consult to begin
    // with. Also false while the query is still in flight, so the button appears once it can
    // actually do something rather than flickering in and immediately erroring.
    const canConvert = isConsult && bookingRequest?.status === "consult_booked";

    // Maps the stored value ('session') to the palette's display label ('Session') using the same
    // APPOINTMENT_TYPE list the wizard populates its buttons from, so the two views can't drift
    // apart. Falls back to the raw value rather than rendering blank if an appointment somehow
    // carries a type not in the list.
    const appointmentTypeLabel =
        APP_SETTINGS_CONSTANTS.APPOINTMENT_TYPE.find(
            (t) => t.value === event.appointmentType,
        )?.label || event.appointmentType || "-";
    // Consults and "Other" appointments legitimately have no Project at all - see
    // models/Appointment.js on projectId being optional.
    const projectLabel = event.project?.title || "No project linked";

	const handleSubmit = (e) => {
		e.preventDefault();
        const newAppointment = {
            id: event.id,
            // Echoed back unchanged - no longer read from a dropdown, same reasoning as
            // shopCutStatus below. See this file's header comment.
            projectId: event.projectId,
            userId: user.id,
            // user.userInfo.shop is legitimately absent for an independent artist (no shop
            // connection - see PRODUCTION_ROADMAP.md's artist-centric tenancy section).
            // Appointment.shopId is nullable for exactly this reason - sending undefined here is
            // correct, not a workaround. Optional-chained since the old unconditional access
            // crashed this whole dialog for such an artist, found via manual testing.
            shopId: user.userInfo?.shop?.id,
            title: titleRef.current.value,
            description: descriptionRef.current.value,
            // Shop cut is no longer editable from this dialog at all (see the removed JSX block
            // below) - echoed back unchanged rather than read from a field that no longer exists,
            // same "don't touch what this view doesn't actually edit" reasoning as
            // SessionDetail.jsx's own minimal-payload save. The amount itself is deliberately NOT
            // sent: it's computed server-side from subtotalCents (see utils/shop-cut.js) and is
            // no longer part of AppointmentInput at all.
            shopCutStatus: event.shopCutStatus,
            appointmentStatus: event.appointmentStatus,
            appointmentType: event.appointmentType,
            createdAt: event.createdAt,
            updatedAt: UtilsService.formatDateToISO(Date.now()),
            appointmentDate: UtilsService.formatDateToISO(startDateTime),
            durationMinutes
        };
        updateAppointment({
			variables: {
				appointmentInput: {
					...newAppointment
				},
			},
			// Apollo normalizes by id, so editing a field the calendar already shows re-renders on
			// its own - but MOVING an appointment changes which month's list it belongs to, and
			// list membership is not something normalization can work out. Without this, dragging
			// an appointment into another month left a copy visible in the old one until reload.
			refetchQueries: AppointmentService.CALENDAR_REFETCH_QUERIES,
		})
			.then(() => {
				setModal({ ...modal, isOpen: false });
			})
			.catch((err) => {
				// Previously: this mutation's promise was never awaited/caught, and the dialog
				// closed unconditionally right after firing it - a failed updateAppointment (e.g.
				// the assertHasShopConnection tenancy check in server/graphql/mutations/
				// appointments.js rejecting a shopId change, or the same-shop-only immutability
				// check) failed completely silently, with no error shown and the dialog closing
				// as if it worked. Now: the modal stays open on failure so the user can see what
				// went wrong, matching the same fix applied to CreateEventDialog.js and the
				// convention this file's own invoice/mark-paid handlers already use below.
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: err.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			});
	};

    // Closes the modal before navigating. IBModal renders through a portal at the app root, so it
    // survives a route change and would otherwise stay open on top of the page it just sent the
    // user to.
    const closeAndNavigate = (to) => {
        setModal({ ...modal, isOpen: false });
        navigate(to);
    };

    const handleViewProject = (e) => {
        e.preventDefault();
        closeAndNavigate(`${ROUTE_CONSTANTS.PROJECT}${event.projectId}`);
    };

    // Mirrors ConsultDetail.jsx's handleConverted - same alert, same navigate-to-the-new-project.
    // The conversion itself is BookSessionDatesForm's job, unchanged: the point of reusing that
    // component rather than reimplementing the flow here is that convertBookingRequest's
    // create-the-Project semantics and the multi-sitting loop only exist in one place.
    const handleConverted = (projectId) => {
        setShowConvertForm(false);
        setAlert({
            isAlert: true,
            severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
            message: "Session booked.",
            timeout: ALERT_CONSTANTS.TIMEOUT,
            location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
        });
        if (projectId) {
            closeAndNavigate(`${ROUTE_CONSTANTS.PROJECT}${projectId}`);
        } else {
            setModal({ ...modal, isOpen: false });
        }
    };

    const handleDelete = (e) => {
        e.preventDefault();
        try{
            deleteAppointment({
                variables: {
                    appointmentId: event.id,
                },
                // Was a cache.modify that DELETEd the `getAppointmentsByShop` field. That evicted
                // exactly one query's cache entry, so a deleted appointment vanished from a
                // shop-affiliated artist's calendar and stayed put on an independent artist's -
                // which reads getAppointmentsByArtist instead. Same refetch list as every other
                // path here now; whichever queries are actually mounted get refreshed.
                refetchQueries: AppointmentService.CALENDAR_REFETCH_QUERIES,
            }).then((res) => {
                setAlert({
                    isAlert: true,
                    severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
                    message: res.data.deleteAppointment,
                    timeout: ALERT_CONSTANTS.TIMEOUT,
                    location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
                });
            });

		    setModal({ ...modal, isOpen: false });

        } catch(err) {
            setAlert({
                isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
            });

		    setModal({ ...modal, isOpen: false });
        }

    }

	// Converting takes over the dialog entirely rather than appearing below the edit fields the way
	// it does on ConsultDetail.jsx. That page has room to show both; a modal doesn't, and leaving
	// a Save button live next to a booking form invites someone to hit the wrong one.
	if (showConvertForm) {
		return (
			<div className="ibCalendarAddEventContainer">
				<DialogContent dividers className="updateEventConvertContent">
					<h3 className="updateEventConvertTitle">Convert to Session</h3>
					<p className="updateEventConvertSubtitle">
						Creates the project from this consult's intake details and books the
						session date(s) against it.
					</p>
					<BookSessionDatesForm
						bookingRequestId={bookingRequest.id}
						initialDate={moment(event.appointmentDate)}
						onSuccess={handleConverted}
						onCancel={() => setShowConvertForm(false)}
						// The appointment this dialog is open on IS the consult, so a deposit taken
						// today is recorded against it.
						consultAppointmentId={event.id}
					/>
				</DialogContent>
			</div>
		);
	}

	return (
			<div className="ibCalendarAddEventContainer">
					<DialogContent dividers>
						<div
							style={{
								display: "flex",
								flexDirection: "row",
								justifyContent: "left",
							}}
						>
							<div style={{ marginRight: 5 }}>
								{/* Editing an appointment is exactly when a conflict matters most -
								    moving one on top of another is the whole risk of a drag. The
								    appointment itself is excluded, or it would flag as overlapping
								    the thing being moved. */}
								<AppointmentSlotPicker
									label="Select Date"
									date={moment(startDateTime)}
									onDateChange={setStartDateTime}
									durationMinutes={durationMinutes}
									onDurationChange={setDurationMinutes}
									artistUserId={event.userId}
									excludeAppointmentId={event.id}
								/>
							</div>
						</div>

						{/* Read-only. See this file's header comment on why type and project are no
						    longer editable from here. */}
						<div className="updateEventReadOnlyFields">
							<div className="updateEventReadOnlyField">
								<span className="updateEventReadOnlyLabel">
									Appointment Type
								</span>
								<span className="updateEventReadOnlyValue">
									{appointmentTypeLabel}
								</span>
							</div>
							<div className="updateEventReadOnlyField">
								<span className="updateEventReadOnlyLabel">Project</span>
								<span className="updateEventReadOnlyValue">
									{projectLabel}
								</span>
							</div>
						</div>
						<IBInput
							inputRef={titleRef}
							helperText="Add Title"
							placeholder="Add title"
                            defaultValue={event.title}
						/>
						<IBMultilineInput
							id="description"
							helperText="Description"
							inputRef={descriptionRef}
                            defaultValue={event.description}
						/>
						{/* Shop cut amount/status used to be shown and editable right here - removed
						    entirely. Paying/invoicing it already lives on the artist dashboard's
						    "Shop Cut Payouts" list (see ArtistPerformancePanel.jsx / ShopCutPayoutList.jsx),
						    across every completed session at once - this dialog duplicating a
						    read-only status readout (plus an amount field with no real workflow
						    attached to it here) added nothing but clutter to what should just be a
						    quick edit of the appointment itself. */}

						{/* A consult that has already been converted. Same message ConsultDetail.jsx
						    shows, so the two views agree about what state this consult is in
						    instead of one of them silently showing nothing. */}
						{isConsult && bookingRequest?.status === "session_booked" && (
							<p className="updateEventConvertedNote">
								This consult already led to a booked session.
							</p>
						)}
					</DialogContent>
					<DialogActions>
                        {
                            event.userId === user.id &&
                            <button onClick={handleDelete} className="ibButton" >
                                DELETE <Delete />
                            </button>
                        }
                        {/* A session always belongs to a Project - that's what makes it a session
                            rather than a consult - so this is the way from the calendar into the
                            work itself: timer, notes, totals, the other sittings. projectId is
                            still checked rather than assumed, since a session created before
                            convertBookingRequest reliably set it may not have one. */}
                        {event.appointmentType === "session" && event.projectId && (
                            <button onClick={handleViewProject} className="ibButton">
                                View Project <OpenInNew />
                            </button>
                        )}
                        {/* Consults are where this dialog used to dead-end: no project to open and
                            no way forward. This is the same conversion ConsultDetail.jsx offers,
                            reachable from the calendar where the artist is already standing. */}
                        {canConvert && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    setShowConvertForm(true);
                                }}
                                className="ibButton"
                            >
                                Convert to Session <EventAvailable />
                            </button>
                        )}
                        <button onClick={handleSubmit} className="ibButton">
                            Update <Update />
                        </button>
					</DialogActions>
			</div>
		);
};

export default UpdateEventDialog;
