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

// Human-readable labels for Appointment.shopCutStatus - see models/Appointment.js's own comment
// on the full enum/lifecycle. Same labels as APP_SETTINGS_CONSTANTS.SHOP_CUT_STATUS
// (client/src/constants/app.js) - kept as a local lookup here rather than importing that array
// and re-deriving a label map from it, since this is just a read-only status display now (see
// below - the actual pay/invoice actions moved to the artist dashboard).
const SHOP_CUT_STATUS_LABELS = {
	none: "No shop cut owed",
	unpaid: "Unpaid",
	invoice_sent: "Invoice sent - awaiting payment",
	pending_confirmation: "Marked paid - awaiting shop confirmation",
	paid: "Paid",
	received: "Received",
};

const UpdateEventDialog = ({ selectedDay, event }) => {
	const { setModal, modal, user, setAlert } = useAuth();
	const titleRef = useRef(event.title);
	const appointmentTypeRef = useRef();
	const projectRef = useRef(event.projectId);
	const descriptionRef = useRef(event.description);
	const shopCutAmountRef = useRef(event.shopCutAmount);
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
            shopCutStatus: event.shopCutStatus,
            // Whole dollars only - matches total/tip/shopMinimum/hourlyRate, which are also Int
            // rather than Float in this schema (see typeDefs.js).
            shopCutAmount: shopCutAmountRef.current.value
                ? parseInt(shopCutAmountRef.current.value, 10)
                : null,
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
						{event.shopId && (
							<>
								<IBInput
									inputRef={shopCutAmountRef}
									helperText="Shop Cut Amount ($)"
									placeholder="e.g. 200"
									type="number"
									defaultValue={selectedEvent.shopCutAmount}
								/>
								{/* Paying/invoicing the shop cut moved to the artist dashboard's
								    "Shop Cut Payouts" list (see ArtistPerformancePanel.jsx /
								    ShopCutPayoutList.jsx) - across every completed session at once
								    rather than one appointment dialog at a time. This is now just a
								    read-only status readout plus the amount input above. */}
								<div className="shopCutLedgerPanel">
									<div className="shopCutLedgerStatus">
										Shop cut:{" "}
										{SHOP_CUT_STATUS_LABELS[selectedEvent.shopCutStatus] ||
											selectedEvent.shopCutStatus ||
											"Unpaid"}
									</div>
									{(!selectedEvent.shopCutStatus ||
										selectedEvent.shopCutStatus === "unpaid") && (
										<div className="shopCutLedgerNote">
											Manage payment for this shop cut from your Dashboard's
											"Shop Cut Payouts" list once this session is marked
											completed.
										</div>
									)}
								</div>
							</>
						)}
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
