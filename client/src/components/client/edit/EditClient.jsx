import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./editClient.css";
import ClientService from "../../../services/ClientService";
import IBPageLoader from "../../../components/ibPageLoader/IBPageLoader";
import { useMutation } from "@apollo/client";
import { useAuth } from "../../../context/auth";
import { ALERT_CONSTANTS, AUTH_SETTINGS_CONSTANTS } from "../../../constants";
import IBInput from "../../inputs/IBInput";

const EditClient = (props) => {
	const navigate = useNavigate();
	let updatedClient = {};
	let params = useParams();
	const { setAlert } = useAuth();
	//#region Userefs
	// const firstName = useRef();
	// const lastName = useRef();
	// const email = useRef();
	// const phone = useRef();
	// const address = useRef();
	// const city = useRef();
	// const state = useRef();
	// const zip = useRef();
	// const instagram = useRef();
	// const facebook = useRef();
	// const avatar = useRef();
	//#endregion

	//#region UseStates
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [address, setAddress] = useState("");
	const [city, setCity] = useState("");
	const [state, setState] = useState("");
	const [zip, setZip] = useState("");
	const [instagram, setInstagram] = useState("");
	const [facebook, setFacebook] = useState("");
	const [client, setClient] = useState({});
	//#endregion


	//Gets client data by id
	const { loading, data } = ClientService.fetchClient(params.clientId);

	useEffect(() => {
		if(data) {
			console.log(data);
			setClient(data.getClient);
		}
	}, []);

	//Gets update mutation gql and returns callback funtion to be used in event handler
	const [updateTheClient] = useMutation(ClientService.updateClient(), {
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
		console.log(client);
		setClient({
			...client,
			[e.target.id]: e.target.value
		});
		console.log(client);
	}

	const handleSave = (e) => {
		
		e.preventDefault();
		//spreads intially fetched client object and updates fields by ref
		updatedClient = {
			...data.getClient,
			firstName: client.firstName,
			lastName: client.lastName,
			email: client.email,
			phone: client.phone,
			address: client.address,
			city: client.city,
			state: client.state,
			zip: client.zip,
			instagram: client.instagram,
			facebook: client.facebook,
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
						<IBInput
							type="text"
							id="firstName"
							onChange={handleChange}
							defaultValue={data.getClient.firstName}
							placeholder="Jon"
						/>
					</div>
					<div className="clientItem">
						<label>Last Name</label>
						<IBInput
							type="text"
							onChange={handleChange}
							id="lastName"
							defaultValue={data.getClient.lastName}
							placeholder="Snow"
						/>
					</div>
					<div className="clientItem">
						<label>email</label>
						<IBInput
							id="email"
							onChange={handleChange}
							defaultValue={data.getClient.email}
							type="email"
							placeholder="Jon@thecopperwolf.com"
						/>
					</div>
					<div className="clientItem">
						<label>Phone</label>
						<IBInput
							type="tel"
							onChange={handleChange}
							id="phone"
							defaultValue={data.getClient.phone}
							placeholder="555-555-5555"
						/>
					</div>
					<div className="clientItem">
						<label>Address</label>
						<IBInput
							onChange={handleChange}
							id="address"
							defaultValue={data.getClient.address}
							type="text"
							placeholder="123 Stark Dr"
						/>
					</div>
					<div className="clientItem">
						<label>City</label>
						<IBInput
							id="city"
							onChange={handleChange}
							defaultValue={data.getClient.city}
							type="text"
							placeholder="Winterfell"
						/>
					</div>
					<div className="clientItem">
						<label>State</label>
						<IBInput
							id="state"
							onChange={handleChange}
							defaultValue={data.getClient.state}
							type="text"
							placeholder="WA"
						/>
					</div>
					<div className="clientItem">
						<label>Zip</label>
						<IBInput
							id="zip"
							onChange={handleChange}
							defaultValue={data.getClient.zip}
							type="text"
							placeholder="98512"
						/>
					</div>
					<div className="clientItem">
						<label>Instagram</label>
						<IBInput
							id="instagram"
							onChange={handleChange}
							defaultValue={data.getClient.instagram}
							type="text"
							placeholder="theDireWolf"
						/>
					</div>
					<div className="clientItem">
						<label>Facebook</label>
						<IBInput
							id="facebook"
							onChange={handleChange}
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
