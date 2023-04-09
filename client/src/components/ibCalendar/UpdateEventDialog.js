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
            shopId: user.userInfo.shop.id,
            title: titleRef.current.value,
            description: descriptionRef.current.value,
            shopCutStatus: event.shopCutStatus,
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
		});
		setModal({ ...modal, isOpen: false });
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
