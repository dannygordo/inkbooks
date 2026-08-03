import { Delete, Save, Update } from "@mui/icons-material";
import { DialogActions, DialogContent, DialogContentText } from "@mui/material";
import moment from "moment";
import React, { useEffect, useRef, useState } from "react";
import { ALERT_CONSTANTS, APP_SETTINGS_CONSTANTS } from "../../constants";
import { useCalendar } from "../../context/calendar";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from "../inputs/IBMultilineInput";
import IBSelect from "../inputs/IBSelect";
import IBSubmitButton from "../inputs/IBSubmitButton";
import { useAuth } from "../../context/auth";
import IBProjectsByArtistSelect from "../inputs/IBProjectsByArtistSelect";
import ProjectService from "../../services/ProjectService";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import { useMutation } from "@apollo/client";
import { AppointmentService } from "../../services/AppointmentService";
import UtilsService from "../../services/UtilsService";

const UpdateEventDialog = ({ selectedDay, event }) => {
	const { setModal, modal, user, setAlert } = useAuth();
	const titleRef = useRef(event.title);
	const appointmentTypeRef = useRef();
	const projectRef = useRef(event.projectId);
	const descriptionRef = useRef(event.description);
	const [startDateTime, setStartDateTime] = useState(moment.utc(event.appointmentDate));
    const [appointmentType, setAppointmentType] = useState(event.appointmentType);
    const [selectedEvent, setSelectedEvent] = useState(event);
	const { loading, data } = ProjectService.fetchProjectsByArtist(user.id);
    const [updateAppointment] = useMutation(AppointmentService.UPDATE_APPOINTMENT);
    const [deleteAppointment] = useMutation(AppointmentService.DELETE_APPOINTMENT);
    console.log(event);

   

	const handleSubmit = (e) => {
		e.preventDefault();
		//console.log(startDateTime.format("LLL"));
        console.log(user);
        const newAppointment = {
            id: event.id,
            projectId: projectRef.current.value,
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
            // SessionDetail.jsx's own minimal-payload save.
            shopCutStatus: event.shopCutStatus,
            shopCutAmount: event.shopCutAmount,
            appointmentStatus: event.appointmentStatus,
            appointmentType: appointmentTypeRef.current.value.toLowerCase(),
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

    const handleProjectChange = (e) =>  {
        let proj = data.getProjectsByArtist.filter((proj) => proj.id === e.target.value);
        console.log(e.target.value);
        console.log(proj);
        titleRef.current.value = proj[0].title;
        descriptionRef.current.value = proj[0].description;
        titleRef.current.focus();
        projectRef.current.value = proj[0].id;
        console.log(projectRef.current.value);
        console.log(proj);
    }

    const handleDelete = (e) => {
        e.preventDefault();
        try{
            console.log(event);
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

	if (data) {
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
							{/* <div>
                                <IBDateTimePicker label="End Date" val={endDateTime} setVal={setEndDateTime}  />
                            </div> */}
						</div>

						<div>
							<IBSelect
								data={APP_SETTINGS_CONSTANTS.APPOINTMENT_TYPE}
								label="Appointment Type"
								inputRef={appointmentTypeRef}
								selectedVal={appointmentType}
								defaultValue={
									APP_SETTINGS_CONSTANTS.APPOINTMENT_TYPE[0]
										.value
								}
							/>
						</div>
						<div>
							<IBProjectsByArtistSelect
								data={data.getProjectsByArtist}
								inputRef={projectRef}
								label="Projects"
                                selectedVal={selectedEvent.projectId}
								defaultValue=""
                                onChange={handleProjectChange}
							/>
						</div>
						<IBInput
							inputRef={titleRef}
							helperText="Add Title"
							placeholder="Add title"
                            defaultValue={selectedEvent.title}
						/>
						<IBMultilineInput
							id="description"
							helperText="Description"
							inputRef={descriptionRef}
                            defaultValue={selectedEvent.description}
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
	}
	return <IBPageLoader />;
};

export default UpdateEventDialog;
