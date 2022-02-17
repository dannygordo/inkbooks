import React, { useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./editArtist.css";
import { ArtistService } from "../../../services/ArtistService";
import IBPageLoader from "../../../components/ibPageLoader/IBPageLoader";
import { useMutation } from "@apollo/client";

const EditArtist = (props) => {
	const navigate = useNavigate();
	let updatedArtist = {};
	let params = useParams();
	//#region Userefs
	const firstName = useRef();
	const lastName = useRef();
	const email = useRef();
	const phone = useRef();
	const title = useRef();
	const address = useRef();
	const city = useRef();
	const state = useRef();
	const zip = useRef();
	const startDate = useRef();
	const instagram = useRef();
	const facebook = useRef();
	const avatar = useRef();
	//#endregion

	//Gets artist data by id
	const { loading, data } = ArtistService.fetchArtist(params.artistId);

	//Gets update mutation gql and returns callback funtion to be used in event handler
	const [updateTheArtist] = useMutation(ArtistService.updateArtist());

	if (loading) {
		return <IBPageLoader />;
	}


	const handleSave = (e) => {
		e.preventDefault();
		//spreads intially fetched artist object and updates fields by ref
		updatedArtist = {
			...data.getArtist,
			firstName: firstName.current.value,
			lastName: lastName.current.value,
			email: email.current.value,
			phone: phone.current.value,
			title: title.current.value,
			address: address.current.value,
			city: city.current.value,
			state: state.current.value,
			zip: zip.current.value,
			startDate: startDate.current.value,
			instagram: instagram.current.value,
			facebook: facebook.current.value,
		};
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
					state:updatedArtist.state,
					zip: updatedArtist.zip,
					startDate: updatedArtist.startDate,
					instagram: updatedArtist.instagram,
					facebook: updatedArtist.facebook
				},
			},
		});
	};
	const handleCancel = (e) => {
		e.preventDefault();
		navigate(-1);
	};

	if (data) {
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
						<input
							type="text"
							ref={firstName}
							defaultValue={data.getArtist.firstName}
							placeholder="Jon"
						/>
					</div>
					<div className="artistItem">
						<label>Last Name</label>
						<input
							type="text"
							ref={lastName}
							defaultValue={data.getArtist.lastName}
							placeholder="Snow"
						/>
					</div>
					<div className="artistItem">
						<label>email</label>
						<input
							ref={email}
							defaultValue={data.getArtist.email}
							type="email"
							placeholder="Jon@thecopperwolf.com"
						/>
					</div>
					<div className="artistItem">
						<label>Phone</label>
						<input
							type="tel"
							ref={phone}
							defaultValue={data.getArtist.phone}
							placeholder="555-555-5555"
						/>
					</div>
					<div className="artistItem">
						<label>Title</label>
						<input
							ref={title}
							defaultValue={data.getArtist.title}
							type="text"
							placeholder="Bastard"
						/>
					</div>
					<div className="artistItem">
						<label>Address</label>
						<input
							ref={address}
							defaultValue={data.getArtist.address}
							type="text"
							placeholder="123 Stark Dr"
						/>
					</div>
					<div className="artistItem">
						<label>City</label>
						<input
							ref={city}
							defaultValue={data.getArtist.city}
							type="text"
							placeholder="Winterfell"
						/>
					</div>
					<div className="artistItem">
						<label>State</label>
						<input
							ref={state}
							defaultValue={data.getArtist.state}
							type="text"
							placeholder="WA"
						/>
					</div>
					<div className="artistItem">
						<label>Zip</label>
						<input
							ref={zip}
							defaultValue={data.getArtist.zip}
							type="text"
							placeholder="98512"
						/>
					</div>
					<div className="artistItem">
						<label>Start Date</label>
						<input
							ref={startDate}
							defaultValue={data.getArtist.startDate}
							type="date"
							placeholder="1/1/2021"
						/>
					</div>
					<div className="artistItem">
						<label>Instagram</label>
						<input
							ref={instagram}
							defaultValue={data.getArtist.instagram}
							type="text"
							placeholder="theDireWolf"
						/>
					</div>
					<div className="artistItem">
						<label>Facebook</label>
						<input
							ref={facebook}
							defaultValue={data.getArtist.facebook}
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
