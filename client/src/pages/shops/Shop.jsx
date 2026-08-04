import { useParams, useSearchParams } from "react-router-dom";
import { useMutation } from "@apollo/client";
import React, { useRef, useState } from "react";
import "./shop.css";
import ShopService  from "../../services/ShopService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";
import IBInput from "../../components/inputs/IBInput";

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
	const [updateShop] = useMutation(ShopService.updateShop());
	const shopCutRef = useRef();
	const [cutSaveState, setCutSaveState] = useState("idle");

	/**
	 * The shop's percentage cut, saved on blur - same autosave pattern as the project Details
	 * panel, and for the same reason: a lone Save button next to one field is more chrome than
	 * the edit is worth.
	 *
	 * This is the only place the percentage can be set. It defaults to 0 (see models/Shop.js -
	 * deliberately, so nothing starts billing artists a cut nobody configured), which means until
	 * someone fills this in, every shop cut computes to zero and the payout list stays empty. That
	 * was a real gap: the ledger was built with no way to configure the number it runs on.
	 */
	const handleShopCutBlur = async () => {
		const raw = shopCutRef.current?.value;
		const percent = raw === "" || raw === undefined ? 0 : Number(raw);
		if (Number.isNaN(percent) || percent < 0 || percent > 100) {
			setCutSaveState("error");
			return;
		}
		if (percent === (data?.getShop?.shopCutPercent ?? 0)) {
			return;
		}
		setCutSaveState("saving");
		try {
			await updateShop({
				variables: {
					shop: {
						id: params.shopId,
						// updateShop replaces the document, so the rest of the shop has to be
						// echoed back or this one edit would blank every other field.
						name: data.getShop.name,
						email: data.getShop.email,
						phone: data.getShop.phone,
						address: data.getShop.address,
						city: data.getShop.city,
						state: data.getShop.state,
						zip: data.getShop.zip,
						instagram: data.getShop.instagram,
						facebook: data.getShop.facebook,
						website: data.getShop.website,
						shopMinimum: data.getShop.shopMinimum,
						hourlyRate: data.getShop.hourlyRate,
						logo: data.getShop.logo,
						billingType: data.getShop.billingType,
						status: data.getShop.status,
						shopCutPercent: percent,
					},
				},
			});
			setCutSaveState("saved");
		} catch (err) {
			setCutSaveState("error");
		}
	};

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
					<div className="squareSectionTitle">Shop cut</div>
					<p className="shopSectionHint">
						The shop's percentage of each artist's session work. Applied to the tattoo
						work only - never to tips, tax or processing fees. Leave at 0 if the shop
						doesn't take a cut.
					</p>
					<div className="shopCutRow">
						<IBInput
							id="shopCutPercent"
							label="Shop cut %"
							type="number"
							sx={{ m: 0, width: "16ch" }}
							fullWidth={false}
							helperText=" "
							inputRef={shopCutRef}
							defaultValue={data.getShop.shopCutPercent ?? 0}
							onBlur={handleShopCutBlur}
						/>
						<span className={`shopCutSaveState shopCutSaveState--${cutSaveState}`}>
							{cutSaveState === "saving" && "Saving..."}
							{cutSaveState === "saved" && "Saved"}
							{cutSaveState === "error" && "Enter a whole number between 0 and 100"}
						</span>
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