import React from "react";
import "./shops.css";
import EntityList from "../../components/entityList/EntityList";
import IBPageActionBar from "../../components/ibPageActionBar/IBPageActionBar";
import ShopService from "../../services/ShopService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import { ROUTE_CONSTANTS } from "../../constants";
import UtilsService from "../../services/UtilsService";

// Was a grid of IBCard tiles. Fields preserved from IBCardHeader + IBCardShopDetails: logo, name,
// website, email, city/state, hourly rate and shop minimum.
//
// The rate figures are whole dollars, not cents - Shop.hourlyRate and Shop.shopMinimum are
// configuration a human types rather than transaction records, and were deliberately left in
// dollars when money moved to integer cents (see server/utils/money.js). Rendered with a plain $
// rather than through formatCents, which would read $150/hr as "$1.50".
const SHOP_COLUMNS = [
	{ key: "phone", label: "Phone", width: "140px" },
	{ key: "location", label: "Location", width: "160px" },
	{ key: "hourly", label: "Hourly", width: "100px" },
	{ key: "minimum", label: "Minimum", width: "100px" },
];

const Shops = () => {
	const { loading, data } = ShopService.fetchShops();
	if (loading) return <IBPageLoader />;

	const items = (data?.getShops || []).map((shop) => ({
		key: shop.id,
		linkTo: `${ROUTE_CONSTANTS.SHOP}${shop.id}`,
		avatar: shop.logo,
		primary: shop.name,
		secondary: shop.website || shop.email,
		values: {
			phone: UtilsService.formatPhone(shop.phone),
			location: [shop.city, shop.state].filter(Boolean).join(", "),
			hourly: shop.hourlyRate ? `$${shop.hourlyRate}` : "",
			minimum: shop.shopMinimum ? `$${shop.shopMinimum}` : "",
		},
	}));

	return (
		<div className="shops">
			<IBPageActionBar pageType="shops" />
			<EntityList columns={SHOP_COLUMNS} items={items} emptyMessage="No shops yet." />
		</div>
	);
};

export default Shops;
