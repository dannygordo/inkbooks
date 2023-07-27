import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./editArtist.css";
import { ArtistService } from "../../../services/ArtistService";
import IBPageLoader from "../../../components/ibPageLoader/IBPageLoader";
import { useMutation } from "@apollo/client";
import { useAuth } from "../../../context/auth";
import { ALERT_CONSTANTS, AUTH_SETTINGS_CONSTANTS } from "../../../constants";
import IBInput from "../../inputs/IBInput";

const EditArtist = (props) => {
const navigate = useNavigate();
let updatedArtist = {};
let params = useParams();
const { setAlert } = useAuth();
//#region UseStates
const [firstName, setFirstName] = useState("");
const [lastName, setLastName] = useState("");
const [email, setEmail] = useState("");
const [phone, setPhone] = useState("");
const [title, setTitle] = useState("");
const [address, setAddress] = useState("");
const [city, setCity] = useState("");
const [state, setState] = useState("");
const [status, setStatus] = useState("");
const [zip, setZip] = useState("");
const [startDate, setStartDate] = useState("");
const [instagram, setInstagram] = useState("");
const [facebook, setFacebook] = useState("");
const [avatar, setAvatar] = useState("");
const [artist, setArtist] = useState({});
//#endregion

	//Gets artist data by id
const { loading, data } = ArtistService.fetchArtist(params.artistId);

useEffect(() => {
	if(data) {
		console.log('wtf');
		setArtist(data.getArtist);
	}
}, []);
//Gets update mutation gql and returns callback function to be used in event handler
const [updateTheArtist] = useMutation(ArtistService.updateArtist(), {
	onCompleted() {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message:
				AUTH_SETTINGS_CONSTANTS.RESPONSE_MESSAGES
					.RECORD_UPDATE_SUCCESS,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	},
});

if (loading) {
	return <IBPageLoader />;
}

const handleChange = (e) => {
	console.log([e.target.id]);
	console.log(e.target.value);
	console.log(artist);
	setArtist({
		...artist,
		[e.target.id]: e.target.value
	});
	console.log(artist);
}

const handleSave = (e) => {
	e.preventDefault();
	//spreads intially fetched artist object and updates fields by ref
	updatedArtist = {
		...data.getArtist,
		firstName: artist.firstName,
		status: artist.status,
		lastName: artist.lastName,
		email: artist.email,
		phone: artist.phone,
		title: artist.title,
		address: artist.address,
		city: artist.city,
		state: artist.state,
		zip: artist.zip,
		startDate: artist.startDate,
		instagram: artist.instagram,
		facebook: artist.facebook,
	};

	console.log(updatedArtist);
	//mutation function takes in updated values in the variables
	updateTheArtist({
		variables: {
			artist: {
				id: updatedArtist.id,
				firstName: updatedArtist.firstName,
				lastName: updatedArtist.lastName,
				email: updatedArtist.email,
				phone: updatedArtist.phone,
				title: updatedArtist.title,
				address: updatedArtist.address,
				city: updatedArtist.city,
				state: updatedArtist.state,
				zip: updatedArtist.zip,
				startDate: updatedArtist.startDate,
				instagram: updatedArtist.instagram,
				facebook: updatedArtist.facebook,
			},
		},
	});
};
const handleCancel = (e) => {
	e.preventDefault();
	navigate(-1);
};

	if (data) {
		const { firstName, lastName, email, phone, title, address, city, state, zip, startDate, instagram, facebook } = data.getArtist;
		return (
			<div className="artist">
				<h1 className="artistTitle">
					{`Edit ${data.getArtist.firstName} ${data.getArtist.lastName}`}
				</h1>
				<form className="artistForm">
					{/* <div className="artistItem">
						<label>Is Active</label>
						<input type="checkbox" defaultChecked={true} />
					</div> */}
					<div className="artistItem">
						<label>First Name</label>
						<IBInput
						type="text"
						id="firstName"
						defaultValue={firstName}
						onChange={handleChange}
						placeholder="Jon"
					/>
					</div>
					<div className="artistItem">
						<label>Last Name</label>
						<IBInput
							type="text"
							id="lastName"
							defaultValue={lastName}
							onChange={handleChange}
							placeholder="Snow"
						/>
					</div>
					<div className="artistItem">
						<label>email</label>
						<IBInput
							id="email"
							defaultValue={email}
							onChange={handleChange}
							type="email"
							placeholder="Jon@thecopperwolf.com"
						/>
					</div>
					<div className="artistItem">
						<label>Phone</label>
						<IBInput
							type="tel"
							id="phone"
							defaultValue={phone}
							onChange={handleChange}
							placeholder="555-555-5555"
						/>
					</div>
					<div className="artistItem">
						<label>Title</label>
						<IBInput
							defaultValue={title}
							id="title"
							onChange={handleChange}
							type="text"
							placeholder="Bastard"
						/>
					</div>
					<div className="artistItem">
						<label>Address</label>
						<IBInput
							defaultValue={address}
							id="address"
							onChange={handleChange}
							type="text"
							placeholder="123 Stark Dr"
						/>
					</div>
					<div className="artistItem">
						<label>City</label>
						<IBInput
							defaultValue={city}
							id="city"
							onChange={handleChange}
							type="text"
							placeholder="Winterfell"
						/>
					</div>
					<div className="artistItem">
						<label>State</label>
						<IBInput
							defaultValue={state}
							id="state"
							onChange={handleChange}
							type="text"
							placeholder="WA"
						/>
					</div>
					<div className="artistItem">
						<label>Zip</label>
						<IBInput
							defaultValue={zip}
							id="zip"
							onChange={handleChange}
							type="text"
							placeholder="98512"
						/>
					</div>
					<div className="artistItem">
						<label>Start Date</label>
						<IBInput
							id="startDate"
							defaultValue={startDate}
							onChange={handleChange}
							type="date"
							placeholder="1/1/2021"
						/>
					</div>
					<div className="artistItem">
						<label>Instagram</label>
						<IBInput
							defaultValue={instagram}
							id="instagram"
							onChange={handleChange}
							type="text"
							placeholder="theDireWolf"
						/>
					</div>
					<div className="artistItem">
						<label>Facebook</label>
						<IBInput
							defaultValue={facebook}
							id="facebook"
							onChange={handleChange}
							type="text"
							placeholder="kingOfTheNorth"
						/>
					</div>
				</form>
				<div className="artistActions">
					<div className="artistActionItem">
						<button
							onClick={handleSave}
							className="artistButton"
							disabled={params.artistId && false}
						>
							Save
						</button>
						<button onClick={handleCancel} className="artistButton">
							Cancel
						</button>
					</div>
					<div className="artistActionItem">
						<button className="artistButton">Delete</button>
					</div>
				</div>
			</div>
		);
	} else {
		return <div>duh</div>;
	}
};
export default EditArtist;
