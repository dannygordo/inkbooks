import React from "react";
import "./shops.css";
import { gql, useQuery } from "@apollo/client";
import IBCard from "../../components/card/ibCard/IBCard";
import { CircularProgress } from "@material-ui/core";
import IBPageActionBar from "../../components/ibPageActionBar/IBPageActionBar";
import ShopService from "../../services/ShopService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";

const Shops = () => {
	const { loading, data } = ShopService.fetchShops();
	if (loading) return <IBPageLoader />;

	return (
		<div className="shops">
			<IBPageActionBar pageType="shops" />
			<div className="shopsContainer">
				{data.getShops.map((shop) => {
					return (
						<IBCard cardData={shop} key={shop.id} cardType="shop" />
					);
				})}
			</div>
		</div>
	);
};

export default Shops;
