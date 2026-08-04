import { useParams, useSearchParams } from "react-router-dom";
import { useMutation } from "@apollo/client";
import "./shop.css";
import ShopService  from "../../services/ShopService";
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

	// The corner "Edit" button is gone from every detail page. It was a fixed action in the top
	// right of a record that didn't say what it edited or where it went, and it was the only way
	// in - so viewing and editing were two separate destinations for the same record, with a
	// round trip between them. Rows now lead straight to the record, and editing belongs beside
	// the thing being edited rather than in a corner. The edit ROUTES are untouched and still
	// reachable directly; only the corner button is removed.

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