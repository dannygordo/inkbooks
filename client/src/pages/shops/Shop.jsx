import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@apollo/client";
import "./shop.css";
import ShopService  from "../../services/ShopService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";

// Messages shown after landing back here from the Square OAuth redirect (see
// routes/squareOAuth.js's callback - it redirects to /shop/:shopId?square=<status>). See
// PRODUCTION_ROADMAP.md's "Shop-cut ledger" section.
const SQUARE_REDIRECT_MESSAGES = {
	connected: { text: "Square account connected.", type: "success" },
	denied: { text: "Square connection was cancelled.", type: "error" },
	error: { text: "Something went wrong connecting Square. Please try again.", type: "error" },
};

const Shop = (props) => {
	const navigate = useNavigate();
	let params = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
    const errors = {};
	/**
	 * Gets shop by id
	 */
	const { loading, data } = ShopService.fetchShop(params.shopId);
	const [getSquareAuthorizationUrl, { loading: squareUrlLoading }] =
		ShopService.useSquareAuthorizationUrl();
	const [disconnectShopSquare] = useMutation(ShopService.DISCONNECT_SHOP_SQUARE);

	/**
	 * Handles the edit click event
	 */
	const handleEdit = (e) => {
		e.preventDefault();
		navigate(`${ROUTE_CONSTANTS.EDIT_SHOP}${params.shopId}`);
	};

	// Redirects the browser straight to Square's own hosted authorization page - InkBooks never
	// shows its own consent UI for this, Square owns that entire screen (see
	// utils/square.js's buildAuthorizationUrl on the server).
	const handleConnectSquare = async (e) => {
		e.preventDefault();
		const res = await getSquareAuthorizationUrl({ variables: { shopId: params.shopId } });
		if (res.data && res.data.getSquareAuthorizationUrl) {
			window.location.href = res.data.getSquareAuthorizationUrl;
		}
	};

	const handleDisconnectSquare = (e) => {
		e.preventDefault();
		disconnectShopSquare({ variables: { shopId: params.shopId } });
	};

	const redirectStatus = searchParams.get("square");
	const redirectMessage = redirectStatus && SQUARE_REDIRECT_MESSAGES[redirectStatus];

	const dismissRedirectBanner = () => {
		searchParams.delete("square");
		setSearchParams(searchParams);
	};

	if (loading) {
		return <IBPageLoader />;
	}

	if (data) {
		return (
			<div className="shop">
				{redirectMessage && (
					<div
						className={`squareBanner ${
							redirectMessage.type === "success"
								? "squareBannerSuccess"
								: "squareBannerError"
						}`}
						onClick={dismissRedirectBanner}
					>
						{redirectMessage.text} (click to dismiss)
					</div>
				)}
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
				<div className="squareSection">
					<div className="squareSectionTitle">Square</div>
					{data.getShop.squareConnected ? (
						<>
							<div className="squareStatusConnected">Connected</div>
							<div className="shopActions">
								<div className="shopActionItem">
									<button className="shopButton" onClick={handleDisconnectSquare}>
										Disconnect Square
									</button>
								</div>
							</div>
						</>
					) : (
						<>
							<div className="squareStatusDisconnected">
								Not connected - connect Square to send shop-cut invoices directly
								to artists.
							</div>
							<div className="shopActions">
								<div className="shopActionItem">
									<button
										className="shopButton"
										onClick={handleConnectSquare}
										disabled={squareUrlLoading}
									>
										{squareUrlLoading ? "Connecting..." : "Connect with Square"}
									</button>
								</div>
							</div>
						</>
					)}
				</div>
			</div>
		);
	} else {
        errors.message = 'This shop does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default Shop