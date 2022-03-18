import { Save } from "@mui/icons-material";
import { DialogActions, DialogContent, DialogContentText } from "@mui/material";
import moment from "moment";
import React, { useRef, useState } from "react";
import { APP_SETTINGS_CONSTANTS } from "../../constants";
import { useCalendar } from "../../context/calendar";
import IBDateTimePicker from "../inputs/IBDateTimePicker";
import IBInput from "../inputs/IBInput";
import IBMultilineInput from '../inputs/IBMultilineInput'
import IBSelect from "../inputs/IBSelect";
import IBSubmitButton from "../inputs/IBSubmitButton";
import { useAuth } from '../../context/auth';
import IBProjectsByArtistSelect from "../inputs/IBProjectsByArtistSelect";
import ProjectService from "../../services/ProjectService";
import IBPageLoader from "../ibPageLoader/IBPageLoader";

const CreateEventDialog = ({ selectedDay }) => {
    const { setModal, modal, user } = useAuth();
	const titleRef = useRef();
	const appointmentTypeRef = useRef();
    const projectRef = useRef();
    const descriptionRef = useRef();
    const [startDateTime, setStartDateTime] = useState(selectedDay);
    // const [endDateTime, setEndDateTime] = useState(selectedDay);
    const { loading, data } = ProjectService.fetchProjectsByArtist(user.id);

	const handleSubmit = (e) => {
		e.preventDefault();
        console.log(startDateTime.format('LLL'));
        setModal({...modal, isOpen: false});
	};
    if(data) {

        return (
            <div className="ibCalendarAddEventContainer">
                <form onSubmit={handleSubmit}>
                    <DialogContent dividers >
                        <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'left' }}>
                            <div style={{marginRight: 5}}>
                                <IBDateTimePicker label="Start Date" val={startDateTime} setVal={setStartDateTime}  />
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
                                    APP_SETTINGS_CONSTANTS.APPOINTMENT_TYPE[0].value
                                }
                            />
                        </div>
                        <div>
                            <IBProjectsByArtistSelect data={data.getProjectsByArtist} inputRef={projectRef} label='Projects' defaultValue={data.getProjectsByArtist[0].id} />
                        </div>
                        <IBInput
                            inputRef={titleRef}
                            label="Add Title"
                            placeholder="Add title"
                        />
                        <IBMultilineInput
                            id="description"
                            label="Description"
                            inputRef={descriptionRef}
                            // defaultValue={data.getProject.description}
                        />
                    </DialogContent>
                    <DialogActions >
                        <IBSubmitButton endIcon={<Save />} text="Save" />
                    </DialogActions>
                </form>
            </div>
        );
    }
    return <IBPageLoader />
};

export default CreateEventDialog;
