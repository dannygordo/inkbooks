import { useParams, useNavigate } from "react-router-dom";
import "./shop.css";
import ShopService  from "../../services/ShopService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";

const Shop = (props) => {
	const navigate = useNavigate();
	let params = useParams();
    const errors = {};
	/**
	 * Gets shop by id
	 */
	const { loading, data } = ShopService.fetchShop(params.shopId);

	/**
	 * Handles the edit click event
	 */
	const handleEdit = (e) => {
		e.preventDefault();
		navigate(`${ROUTE_CONSTANTS.EDIT_SHOP}${params.shopId}`);
	};

	if (loading) {
		return <IBPageLoader />;
	}

	if (data) {
		return (
			<div className="shop">
				<h1 className="shopTitle">
					{data.getShop.name}
				</h1>
				<div>
					<div className="shopActions">
						<div className="shopActionItem">
							<button
								onClick={handleEdit}
								className="shopButton"
								disabled={params.shopId && false}
							>
								Edit Shop
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	} else {
        errors.message = 'This shop does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default Shop