import React, { useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./editStaff.css";
import StaffService from "../../../services/StaffService";
import IBPageLoader from "../../../components/ibPageLoader/IBPageLoader";
import { useMutation } from "@apollo/client";

const EditStaff = (props) => {
	const navigate = useNavigate();
	let updatedStaff = {};
	let params = useParams();
	//#region Userefs
	const firstName = useRef();
	const lastName = useRef();
	const email = useRef();
	const phone = useRef();
	const address = useRef();
	const city = useRef();
	const state = useRef();
	const zip = useRef();
	const instagram = useRef();
	const facebook = useRef();
	const avatar = useRef();
	const title = useRef();
	const status = useRef();
	//#endregion

	//Gets staff data by id
	const { loading, data } = StaffService.fetchOneStaff(params.staffId);

	//Gets update mutation gql and returns callback funtion to be used in event handler
	const [updateTheStaff] = useMutation(StaffService.updateStaff());

	if (loading) {
		return <IBPageLoader />;
	}

	const handleSave = (e) => {
		e.preventDefault();
		//spreads intially fetched staff object and updates fields by ref
		updatedStaff = {
			...data.getOneStaff,
			firstName: firstName.current.value,
			lastName: lastName.current.value,
			email: email.current.value,
			phone: phone.current.value,
			address: address.current.value,
			city: city.current.value,
			state: state.current.value,
			zip: zip.current.value,
			instagram: instagram.current.value,
			facebook: facebook.current.value,
			title: title.current.value,
		};
		//mutation function takes in updated values in the variables
		updateTheStaff({
			variables: {
				staff: {
					id: updatedStaff.id,
					firstName: updatedStaff.firstName,
					lastName: updatedStaff.lastName,
					email: updatedStaff.email,
					phone: updatedStaff.phone,
					address: updatedStaff.address,
					city: updatedStaff.city,
					state: updatedStaff.state,
					zip: updatedStaff.zip,
					instagram: updatedStaff.instagram,
					facebook: updatedStaff.facebook,
					title: updatedStaff.title,
                    shopId: updatedStaff.shopId,
                    userId: updatedStaff.userId,
                    status: updatedStaff.status
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
			<div className="staff">
				<h1 className="staffTitle">
					{`Edit ${data.getOneStaff.firstName} ${data.getOneStaff.lastName}`}
				</h1>
				<form className="staffForm">
					{/* <div className="staffItem">
						<label>Is Active</label>
						<input type="checkbox" defaultChecked={true} />
					</div> */}
					<div className="staffItem">
						<label>First Name</label>
						<input
							type="text"
							ref={firstName}
							defaultValue={data.getOneStaff.firstName}
							placeholder="Jon"
						/>
					</div>
					<div className="staffItem">
						<label>Last Name</label>
						<input
							type="text"
							ref={lastName}
							defaultValue={data.getOneStaff.lastName}
							placeholder="Snow"
						/>
					</div>
					<div className="staffItem">
						<label>email</label>
						<input
							ref={email}
							defaultValue={data.getOneStaff.email}
							type="email"
							placeholder="Jon@thecopperwolf.com"
						/>
					</div>
					<div className="artistItem">
						<label>Title</label>
						<input
							ref={title}
							defaultValue={data.getOneStaff.title}
							type="text"
							placeholder="Bastard"
						/>
					</div>
					<div className="staffItem">
						<label>Phone</label>
						<input
							type="tel"
							ref={phone}
							defaultValue={data.getOneStaff.phone}
							placeholder="555-555-5555"
						/>
					</div>
					<div className="staffItem">
						<label>Address</label>
						<input
							ref={address}
							defaultValue={data.getOneStaff.address}
							type="text"
							placeholder="123 Stark Dr"
						/>
					</div>
					<div className="staffItem">
						<label>City</label>
						<input
							ref={city}
							defaultValue={data.getOneStaff.city}
							type="text"
							placeholder="Winterfell"
						/>
					</div>
					<div className="staffItem">
						<label>State</label>
						<input
							ref={state}
							defaultValue={data.getOneStaff.state}
							type="text"
							placeholder="WA"
						/>
					</div>
					<div className="staffItem">
						<label>Zip</label>
						<input
							ref={zip}
							defaultValue={data.getOneStaff.zip}
							type="text"
							placeholder="98512"
						/>
					</div>
					<div className="staffItem">
						<label>Instagram</label>
						<input
							ref={instagram}
							defaultValue={data.getOneStaff.instagram}
							type="text"
							placeholder="theDireWolf"
						/>
					</div>
					<div className="staffItem">
						<label>Facebook</label>
						<input
							ref={facebook}
							defaultValue={data.getOneStaff.facebook}
							type="text"
							placeholder="kingOfTheNorth"
						/>
					</div>
				</form>
				<div className="staffActions">
					<div className="staffActionItem">
						<button
							onClick={handleSave}
							className="staffButton"
							disabled={params.staffId && false}
						>
							Save
						</button>
						<button onClick={handleCancel} className="staffButton">
							Cancel
						</button>
					</div>
					<div className="staffActionItem">
						<button className="staffButton">Delete</button>
					</div>
				</div>
			</div>
		);
	} else {
		return <div>duh</div>;
	}
};
export default EditStaff;
