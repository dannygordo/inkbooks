import { Delete, Update } from "@mui/icons-material";
import { DialogActions, DialogContent } from "@mui/material";
import moment from "moment";
import React, { useRef, useState } from "react";
import { ALERT_CONSTANTS, APP_SETTINGS_CONSTANTS } from "../../constants";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
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
	const titleRef = useRef(event.title);
	const descriptionRef = useRef(event.description);
	const [startDateTime, setStartDateTime] = useState(moment.utc(event.appointmentDate));
    const [updateAppointment] = useMutation(AppointmentService.UPDATE_APPOINTMENT);
    const [deleteAppointment] = useMutation(AppointmentService.DELETE_APPOINTMENT);

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
            appointmentDate: UtilsService.formatDateToISO(startDateTime)
        };
        updateAppointment({
			variables: {
				appointmentInput: {
					...newAppointment
				},
			},
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

    const handleDelete = (e) => {
        e.preventDefault();
        try{
            deleteAppointment({
                variables: {
                    appointmentId: event.id,
                },
                update: (cache, { data }) => {
                    //const cacheId = cache.identify(data.createAppointment);
                    cache.modify({
                        fields: {
                            getAppointmentsByShop: (existingFieldData, { DELETE }) => {
                                return DELETE;
                                //return [...existingFieldData, toReference(cacheId)];
                            }
                        }
                    });
                },
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
								<IBDateTimePicker
									label="Select Date"
									val={moment.utc(startDateTime)}
									setVal={setStartDateTime}
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
					</DialogContent>
					<DialogActions>
                        {
                            event.userId === user.id &&
                            <button onClick={handleDelete} className="ibButton" >
                                DELETE <Delete />
                            </button>
                        }
                        <button onClick={handleSubmit} className="ibButton">
                            Update <Update />
                        </button>
					</DialogActions>
			</div>
		);
};

export default UpdateEventDialog;
