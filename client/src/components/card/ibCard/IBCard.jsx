import React from "react";
import IBCardActions from "../ibCardActions/IBCardActions";
import IBCardArtistDetails from "../ibCardArtistDetails/IBCardArtistDetails";
import IBCardClientDetails from "../ibCardClientDetails/IBCardClientDetails";
import IBCardHeader from "../ibCardHeader/IBCardHeader";
import IBCardProjectDetails from "../ibCardProjectDetails/IBCardProjectDetails";
import IBCardShopDetails from "../ibCardShopDetails/IBCardShopDetails";
import IBCardStaffDetails from "../ibCardStaffDetails/IBCardStaffDetails";
import "./ibCard.css";
import { useNavigate } from "react-router-dom";
import { APP_SETTINGS_CONSTANTS, ROUTE_CONSTANTS } from "../../../constants";
import IBRouteNotFound from "../../ibRouteNotFound/IBRouteNotFound";

const IBCard = (props) => {
	const { cardData, cardType } = props;

	let navigate = useNavigate();
	switch (cardType) {
		case APP_SETTINGS_CONSTANTS.CARD_TYPES.ARTIST:
			return (
				<div
					className="ibCard"
					key={cardData.id}
					onClick={(e) =>
						navigate(`${ROUTE_CONSTANTS.ARTIST}${cardData.id}`)
					}
				>
					{/* <div className="ibCardActionsContainer">
            <IBCardActions cardData={cardData} key={cardData.id}/>
          </div> */}
					<IBCardHeader
						cardType={APP_SETTINGS_CONSTANTS.CARD_TYPES.ARTIST}
						cardData={cardData}
						key={cardData.id}
					/>
					<IBCardArtistDetails cardData={cardData} key={Date.now()} />
				</div>
			);
		case APP_SETTINGS_CONSTANTS.CARD_TYPES.CLIENT:
			return (
				<div
					className="ibCard"
					key={cardData.id}
					onClick={(e) =>
						navigate(`${ROUTE_CONSTANTS.CLIENT}${cardData.id}`)
					}
				>
					{/* <div className="ibCardActionsContainer">
						<IBCardActions cardData={cardData} key={cardData.id} />
					</div> */}
					<IBCardHeader
						cardType={APP_SETTINGS_CONSTANTS.CARD_TYPES.CLIENT}
						cardData={cardData}
						key={cardData.id}
					/>
					<IBCardClientDetails cardData={cardData} key={Date.now()} />
				</div>
			);
		case APP_SETTINGS_CONSTANTS.CARD_TYPES.PROJECT:
			return (
				<div
					className="ibCard"
					key={cardData.id}
					onClick={(e) =>
						navigate(`${ROUTE_CONSTANTS.PROJECT}${cardData.id}`)
					}
				>
					{/* <div className="ibCardActionsContainer">
						<IBCardActions cardData={cardData} key={cardData.id} />
					</div> */}
					<IBCardHeader
						cardData={cardData}
						key={cardData.id}
						cardType={APP_SETTINGS_CONSTANTS.CARD_TYPES.PROJECT}
					/>
					<IBCardProjectDetails
						cardData={cardData}
						key={Date.now()}
					/>
				</div>
			);
		case APP_SETTINGS_CONSTANTS.CARD_TYPES.SHOP:
			return (
				<div
					className="ibCard"
					key={cardData.id}
					onClick={(e) =>
						navigate(`${ROUTE_CONSTANTS.SHOP}${cardData.id}`)
					}
				>
					{/* <div className="ibCardActionsContainer">
						<IBCardActions cardData={cardData} key={cardData.id} />
					</div> */}
					<IBCardHeader
						cardData={cardData}
						key={cardData.id}
						cardType={APP_SETTINGS_CONSTANTS.CARD_TYPES.SHOP}
					/>
					<IBCardShopDetails cardData={cardData} key={Date.now()} />
				</div>
			);
		case APP_SETTINGS_CONSTANTS.CARD_TYPES.STAFF:
			return (
				<div
					className="ibCard"
					key={cardData.id}
					onClick={(e) =>
						navigate(`${ROUTE_CONSTANTS.STAFF}${cardData.id}`)
					}
				>
					<IBCardHeader
						cardData={cardData}
						key={cardData.id}
						cardType={APP_SETTINGS_CONSTANTS.CARD_TYPES.STAFF}
					/>
					<IBCardStaffDetails cardData={cardData} key={Date.now()} />
				</div>
			);
		case APP_SETTINGS_CONSTANTS.CARD_TYPES.ROUTE_NOT_FOUND:
			return (
					<IBRouteNotFound cardData={cardData} key={Date.now()} />
			);
		default:
			return (
				<div className="ibCard" key={cardData.id}>
					<div className="ibCardActionsContainer">
						<IBCardActions cardData={cardData} key={cardData.id} />
					</div>
					<IBCardHeader cardData={cardData} key={cardData.id} />
				</div>
			);
	}
};

export default IBCard;
