import React, { useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./editShop.css";
import ShopService from "../../../services/ShopService";
import IBPageLoader from "../../../components/ibPageLoader/IBPageLoader";
import { useMutation } from "@apollo/client";
import IBInput from "../../inputs/IBInput";

const EditShop = (props) => {
	const navigate = useNavigate();
	let updatedShop = {};
	let params = useParams();
	//#region Userefs
	const name = useRef();
	const email = useRef();
	const phone = useRef();
	const address = useRef();
	const city = useRef();
	const state = useRef();
	const zip = useRef();
	const instagram = useRef();
	const facebook = useRef();
	const website = useRef();
	const logo = useRef();
    const shopMinimum = useRef();
    const hourlyRate = useRef();
    const billingType = useRef();
	//#endregion

	//Gets shop data by id
	const { loading, data } = ShopService.fetchShop(params.shopId);

	//Gets update mutation gql and returns callback funtion to be used in event handler
	const [updateTheShop] = useMutation(ShopService.updateShop());

	if (loading) {
		return <IBPageLoader />;
	}

	const handleSave = (e) => {
		e.preventDefault();
		//spreads intially fetched shop object and updates fields by ref
		updatedShop = {
			...data.getShop,
			name: name.current.value,
			email: email.current.value,
			phone: phone.current.value,
			address: address.current.value,
			city: city.current.value,
			state: state.current.value,
			zip: zip.current.value,
			instagram: instagram.current.value,
			facebook: facebook.current.value,
            website: website.current.value,
            shopMinimum: parseInt(shopMinimum.current.value),
            hourlyRate: parseInt(hourlyRate.current.value),
            //logo: logo.current.value,
            billingType: parseInt(billingType.current.value)
		};
		//mutation function takes in updated values in the variables
		updateTheShop({
			variables: {
				shop: {
					id: updatedShop.id,
					name: updatedShop.name,
					email: updatedShop.email,
					phone: updatedShop.phone,
					address: updatedShop.address,
					city: updatedShop.city,
					state: updatedShop.state,
					zip: updatedShop.zip,
					instagram: updatedShop.instagram,
					facebook: updatedShop.facebook,
                    website: updatedShop.website,
                    shopMinimum: updatedShop.shopMinimum,
                    hourlyRate: updatedShop.hourlyRate,
                    //logo: updatedShop.logo,
                    billingType: updatedShop.billingType
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
			<div className="shop">
				<h1 className="shopTitle">
					{`Edit ${data.getShop.name}`}
				</h1>
				<form className="shopForm">
					{/* <div className="shopItem">
						<label>Is Active</label>
						<input type="checkbox" defaultChecked={true} />
					</div> */}
					<div className="shopItem">
						<label>Name</label>
						<IBInput
							type="text"
							inputRef={name}
							defaultValue={data.getShop.name}
							placeholder="Jon"
						/>
					</div>
					<div className="shopItem">
						<label>email</label>
						<IBInput
							inputRef={email}
							defaultValue={data.getShop.email}
							type="email"
							placeholder="Jon@thecopperwolf.com"
						/>
					</div>
					<div className="shopItem">
						<label>Phone</label>
						<IBInput
							type="tel"
							inputRef={phone}
							defaultValue={data.getShop.phone}
							placeholder="555-555-5555"
						/>
					</div>
					<div className="shopItem">
						<label>Address</label>
						<IBInput
							inputRef={address}
							defaultValue={data.getShop.address}
							type="text"
							placeholder="123 Stark Dr"
						/>
					</div>
					<div className="shopItem">
						<label>City</label>
						<IBInput
							inputRef={city}
							defaultValue={data.getShop.city}
							type="text"
							placeholder="Winterfell"
						/>
					</div>
					<div className="shopItem">
						<label>State</label>
						<IBInput
							inputRef={state}
							defaultValue={data.getShop.state}
							type="text"
							placeholder="WA"
						/>
					</div>
					<div className="shopItem">
						<label>Zip</label>
						<IBInput
							inputRef={zip}
							defaultValue={data.getShop.zip}
							type="text"
							placeholder="98512"
						/>
					</div>
					<div className="shopItem">
						<label>Instagram</label>
						<IBInput
							inputRef={instagram}
							defaultValue={data.getShop.instagram}
							type="text"
							placeholder="theDireWolf"
						/>
					</div>
					<div className="shopItem">
						<label>Facebook</label>
						<IBInput
							inputRef={facebook}
							defaultValue={data.getShop.facebook}
							type="text"
							placeholder="kingOfTheNorth"
						/>
					</div>
                    <div className="shopItem">
						<label>Website</label>
						<IBInput
							inputRef={website}
							defaultValue={data.getShop.website}
							type="text.com"
							placeholder="kingOfTheNorth.com"
						/>
					</div>
                    <div className="shopItem">
						<label>Shop Minimum</label>
						<IBInput
							inputRef={shopMinimum}
							defaultValue={data.getShop.shopMinimum}
							type="number"
							placeholder="100"
						/>
					</div>
                    <div className="shopItem">
						<label>Hourly Rate</label>
						<IBInput
							inputRef={hourlyRate}
							defaultValue={data.getShop.hourlyRate}
							type="number"
							placeholder="200"
						/>
					</div>
                    <div className="shopItem">
						<label>Billing Type</label>
						<IBInput
							inputRef={billingType}
							defaultValue={data.getShop.billingType}
							type="number"
							placeholder="0"
						/>
					</div>
				</form>
				<div className="shopActions">
					<div className="shopActionItem">
						<button
							onClick={handleSave}
							className="shopButton"
							disabled={params.shopId && false}
						>
							Save
						</button>
						<button onClick={handleCancel} className="shopButton">
							Cancel
						</button>
					</div>
					<div className="shopActionItem">
						<button className="shopButton">Delete</button>
					</div>
				</div>
			</div>
		);
	} else {
		return <div>duh</div>;
	}
};
export default EditShop;
