import { Save } from "@mui/icons-material";
import { DialogActions, DialogContent, DialogContentText } from "@mui/material";
import moment from "moment";
import React, { useRef, useState } from "react";
import { APP_SETTINGS_CONSTANTS } from "../../constants";
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
import { letterSpacing } from "@mui/system";

const CreateEventDialog = ({ selectedDay }) => {
	const { setModal, modal, user } = useAuth();
	const titleRef = useRef();
	const appointmentTypeRef = useRef();
	const projectRef = useRef();
	const descriptionRef = useRef();
	const [startDateTime, setStartDateTime] = useState(moment.utc(selectedDay));
	// const [endDateTime, setEndDateTime] = useState(selectedDay);
	const { loading, data } = ProjectService.fetchProjectsByArtist(user.id);
	const [createAppointment] = useMutation(
		AppointmentService.CREATE_APPOINTMENT,
        // {refetchQueries: [
        //     {
        //         query: AppointmentService.FETCH_APPOINTMENTS_BY_SHOP,
        //         variables: { shopId: user.userInfo.shop.id },
        //     },
        // ]},
	);

	const handleSubmit = (e) => {
		e.preventDefault();
		let newAppointment = {};
		if (projectRef.current.value) {
			newAppointment = {
				projectId: projectRef.current.value,
				userId: user.id,
				shopId: user.userInfo.shop.id,
				title: titleRef.current.value,
				description: descriptionRef.current.value,
				shopCutStatus: "unpaid",
				appointmentStatus: "scheduled",
				appointmentType: appointmentTypeRef.current.value.toLowerCase(),
				createdAt: UtilsService.formatDateToISO(Date.now()),
				updatedAt: UtilsService.formatDateToISO(Date.now()),
				appointmentDate: UtilsService.formatDateToISO(startDateTime),
			};
		} else {
			newAppointment = {
				userId: user.id,
				shopId: user.userInfo.shop.id,
				title: titleRef.current.value,
				description: descriptionRef.current.value,
				shopCutStatus: "unpaid",
				appointmentStatus: "scheduled",
				appointmentType: appointmentTypeRef.current.value.toLowerCase(),
				createdAt: UtilsService.formatDateToISO(Date.now()),
				updatedAt: UtilsService.formatDateToISO(Date.now()),
				appointmentDate: UtilsService.formatDateToISO(startDateTime),
			};
		}

		createAppointment({
			variables: {
				appointmentInput: {
					...newAppointment,
				},
			},
            
			update: (cache, { data }) => {
				console.log(cache);
				const cacheId = cache.identify(data.createAppointment);
				console.log(cacheId);
				cache.modify({
				    fields: {
				        getAppointmentsByShop: (existingFieldData, { toReference }) => {
				            console.log(existingFieldData);
				            console.log(toReference(cacheId));
				            return [...existingFieldData, toReference(cacheId)];
				        }
				    }
				});
				console.log(cache);
			},
		});
		setModal({ ...modal, isOpen: false });
	};

	const handleProjectChange = (e) => {
		let proj = data.getProjectsByArtist.filter(
			(proj) => proj.id === e.target.value
		);
		console.log(e.target.value);
		console.log(proj);
		titleRef.current.value = proj[0].title;
		descriptionRef.current.value = proj[0].description;
		titleRef.current.focus();
		projectRef.current.value = proj.id;
	};
	if (data) {
		return (
			<div className="ibCalendarAddEventContainer">
				<form onSubmit={handleSubmit}>
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
									val={startDateTime}
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
								// selectedVal={selectedVal}
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
								value={data.getProjectsByArtist.id}
								defaultValue=""
								onChange={handleProjectChange}
							/>
						</div>
						<IBInput
							inputRef={titleRef}
							helperText="Add Title"
							placeholder="Add title"
						/>
						<IBMultilineInput
							id="description"
							helperText="Description"
							inputRef={descriptionRef}
							// defaultValue={data.getProject.description}
						/>
					</DialogContent>
					<DialogActions>
						<IBSubmitButton endIcon={<Save />} text="Save" />
					</DialogActions>
				</form>
			</div>
		);
	}
	return <IBPageLoader />;
};

export default CreateEventDialog;
