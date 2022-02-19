import React, { useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./editClient.css";
import ClientService from "../../../services/ClientService";
import IBPageLoader from "../../../components/ibPageLoader/IBPageLoader";
import { useMutation } from "@apollo/client";

const EditClient = (props) => {
	const navigate = useNavigate();
	let updatedClient = {};
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
	//#endregion

	//Gets client data by id
	const { loading, data } = ClientService.fetchClient(params.clientId);

	//Gets update mutation gql and returns callback funtion to be used in event handler
	const [updateTheClient] = useMutation(ClientService.updateClient());

	if (loading) {
		return <IBPageLoader />;
	}

	const handleSave = (e) => {
		e.preventDefault();
		//spreads intially fetched client object and updates fields by ref
		updatedClient = {
			...data.getClient,
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
		};
		//mutation function takes in updated values in the variables
		updateTheClient({
			variables: {
				client: {
					id: updatedClient.id,
					firstName: updatedClient.firstName,
					lastName: updatedClient.lastName,
					email: updatedClient.email,
					phone: updatedClient.phone,
					address: updatedClient.address,
					city: updatedClient.city,
					state: updatedClient.state,
					zip: updatedClient.zip,
					instagram: updatedClient.instagram,
					facebook: updatedClient.facebook,
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
			<div className="client">
				<h1 className="clientTitle">
					{`Edit ${data.getClient.firstName} ${data.getClient.lastName}`}
				</h1>
				<form className="clientForm">
					{/* <div className="clientItem">
						<label>Is Active</label>
						<input type="checkbox" defaultChecked={true} />
					</div> */}
					<div className="clientItem">
						<label>First Name</label>
						<input
							type="text"
							ref={firstName}
							defaultValue={data.getClient.firstName}
							placeholder="Jon"
						/>
					</div>
					<div className="clientItem">
						<label>Last Name</label>
						<input
							type="text"
							ref={lastName}
							defaultValue={data.getClient.lastName}
							placeholder="Snow"
						/>
					</div>
					<div className="clientItem">
						<label>email</label>
						<input
							ref={email}
							defaultValue={data.getClient.email}
							type="email"
							placeholder="Jon@thecopperwolf.com"
						/>
					</div>
					<div className="clientItem">
						<label>Phone</label>
						<input
							type="tel"
							ref={phone}
							defaultValue={data.getClient.phone}
							placeholder="555-555-5555"
						/>
					</div>
					<div className="clientItem">
						<label>Address</label>
						<input
							ref={address}
							defaultValue={data.getClient.address}
							type="text"
							placeholder="123 Stark Dr"
						/>
					</div>
					<div className="clientItem">
						<label>City</label>
						<input
							ref={city}
							defaultValue={data.getClient.city}
							type="text"
							placeholder="Winterfell"
						/>
					</div>
					<div className="clientItem">
						<label>State</label>
						<input
							ref={state}
							defaultValue={data.getClient.state}
							type="text"
							placeholder="WA"
						/>
					</div>
					<div className="clientItem">
						<label>Zip</label>
						<input
							ref={zip}
							defaultValue={data.getClient.zip}
							type="text"
							placeholder="98512"
						/>
					</div>
					<div className="clientItem">
						<label>Instagram</label>
						<input
							ref={instagram}
							defaultValue={data.getClient.instagram}
							type="text"
							placeholder="theDireWolf"
						/>
					</div>
					<div className="clientItem">
						<label>Facebook</label>
						<input
							ref={facebook}
							defaultValue={data.getClient.facebook}
							type="text"
							placeholder="kingOfTheNorth"
						/>
					</div>
				</form>
				<div className="clientActions">
					<div className="clientActionItem">
						<button
							onClick={handleSave}
							className="clientButton"
							disabled={params.clientId && false}
						>
							Save
						</button>
						<button onClick={handleCancel} className="clientButton">
							Cancel
						</button>
					</div>
					<div className="clientActionItem">
						<button className="clientButton">Delete</button>
					</div>
				</div>
			</div>
		);
	} else {
		return <div>duh</div>;
	}
};
export default EditClient;
