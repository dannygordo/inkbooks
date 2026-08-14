import { useParams, useSearchParams } from "react-router-dom";
import { useMutation } from "@apollo/client";
import React, { useRef, useState } from "react";
import "./shop.css";
import ShopService  from "../../services/ShopService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";
import IBInput from "../../components/inputs/IBInput";
import FormField from "../../components/formField/FormField";
import { useAuth } from "../../context/auth";
import { ROLES, ALERT_CONSTANTS } from "../../constants";

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
	const { user, setAlert } = useAuth();
	/**
	 * Gets shop by id
	 */
	const { loading, data } = ShopService.fetchShop(params.shopId);
	const [getSquareAuthorizationUrl, { loading: squareUrlLoading }] =
		ShopService.useSquareAuthorizationUrl();
	const [disconnectShopSquare] = useMutation(ShopService.DISCONNECT_SHOP_SQUARE);
	const [updateShop] = useMutation(ShopService.updateShop());
	const shopCutRef = useRef();
	const nameRef = useRef();
	const emailRef = useRef();
	const phoneRef = useRef();
	const addressRef = useRef();
	const cityRef = useRef();
	const stateRef = useRef();
	const zipRef = useRef();
	const instagramRef = useRef();
	const facebookRef = useRef();
	const websiteRef = useRef();
	// One shared save state for the whole page - the shop-cut field and the rest of the shop's
	// details all save through the same buildShopPayload/handleShopFieldBlur pair below now, so
	// they share one status line rather than two nearly-identical ones.
	const lastSavedShopRef = useRef(null);
	const [detailsSaveState, setDetailsSaveState] = useState("idle");

	// updateShop has a hard SHOP_ADMIN floor server-side (mutations/shops.js's withAuth call),
	// same as updateStaff - there's no self-service path for someone below that, so the fields are
	// read-only for anyone else who can reach this page.
	const canEdit = user.role <= ROLES.SHOP_ADMIN;

	/**
	 * Assembles the full shop document to send on every field's blur - name/contact fields via
	 * refs, everything else (shopMinimum, hourlyRate, logo, billingType, status) echoed straight
	 * from the query result since nothing on this page edits them. updateShop's own resolver
	 * (server/graphql/mutations/shops.js) calls Shop.findByIdAndUpdate with this object directly -
	 * see handleShopCutBlur's original comment on why the rest of the shop has to be echoed back
	 * rather than sent as just the one changed field.
	 */
	const buildShopPayload = () => {
		const rawCut = shopCutRef.current?.value;
		const shopCutPercent =
			rawCut === "" || rawCut === undefined ? 0 : Number(rawCut);
		return {
			id: params.shopId,
			name: nameRef.current?.value ?? data.getShop.name,
			email: emailRef.current?.value ?? data.getShop.email,
			phone: phoneRef.current?.value ?? data.getShop.phone,
			address: addressRef.current?.value ?? data.getShop.address,
			city: cityRef.current?.value ?? data.getShop.city,
			state: stateRef.current?.value ?? data.getShop.state,
			zip: zipRef.current?.value ?? data.getShop.zip,
			instagram: instagramRef.current?.value ?? data.getShop.instagram,
			facebook: facebookRef.current?.value ?? data.getShop.facebook,
			website: websiteRef.current?.value ?? data.getShop.website,
			shopMinimum: data.getShop.shopMinimum,
			hourlyRate: data.getShop.hourlyRate,
			logo: data.getShop.logo,
			billingType: data.getShop.billingType,
			status: data.getShop.status,
			shopCutPercent,
		};
	};

	/**
	 * Autosave for every field on this page, fired on blur - the shop's percentage cut and now the
	 * rest of its name/contact details, which previously had nowhere to be edited at all short of
	 * typing /shop/edit/:shopId by hand. Same pattern as the project Details panel: a lone Save
	 * button next to a handful of fields is more chrome than the edit is worth, and the dirty check
	 * against the last payload actually sent is what makes it safe to attach to every one of them -
	 * tabbing through untouched fields changes nothing and must not write.
	 *
	 * The percent-range validation stays specific to shopCutPercent (0 is the default so nothing
	 * starts billing artists a cut nobody configured - see models/Shop.js) - an invalid value there
	 * blocks the whole save rather than silently dropping just that field, since a shop cut that
	 * doesn't parse is worth surfacing loudly.
	 */
	const handleShopFieldBlur = async () => {
		const rawCut = shopCutRef.current?.value;
		const shopCutPercent =
			rawCut === "" || rawCut === undefined ? 0 : Number(rawCut);
		if (Number.isNaN(shopCutPercent) || shopCutPercent < 0 || shopCutPercent > 100) {
			setDetailsSaveState("error");
			return;
		}
		const payload = buildShopPayload();
		const serialized = JSON.stringify(payload);
		if (serialized === lastSavedShopRef.current) {
			return;
		}
		lastSavedShopRef.current = serialized;
		setDetailsSaveState("saving");
		try {
			await updateShop({ variables: { shop: payload } });
			setDetailsSaveState("saved");
		} catch (err) {
			lastSavedShopRef.current = null;
			setDetailsSaveState("error");
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: `Couldn't save: ${err.graphQLErrors?.[0]?.message || err.message}`,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
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
				<div className="shopTitleRow">
					<h1 className="shopTitle">
						{data.getShop.name}
					</h1>
					<span
						className={`shopDetailsSaveState shopDetailsSaveState--${detailsSaveState}`}
					>
						{detailsSaveState === "saving" && "Saving..."}
						{detailsSaveState === "saved" && "All changes saved"}
						{detailsSaveState === "error" && "Couldn't save - try again"}
					</span>
				</div>
				{!canEdit && (
					<p className="shopSectionHint">Only a shop admin can edit these details.</p>
				)}
				<div className="squareSection">
					<div className="squareSectionTitle">Shop Info</div>
					<div className="ibFieldGroup">
						<FormField id="shopName" label="Name">
							<IBInput
								id="shopName"
								inputRef={nameRef}
								defaultValue={data.getShop.name}
								disabled={!canEdit}
								onBlur={handleShopFieldBlur}
							/>
						</FormField>
						<div className="ibFieldRow">
							<FormField id="shopEmail" label="Email">
								<IBInput
									id="shopEmail"
									type="email"
									inputRef={emailRef}
									defaultValue={data.getShop.email}
									disabled={!canEdit}
									onBlur={handleShopFieldBlur}
								/>
							</FormField>
							<FormField id="shopPhone" label="Phone">
								<IBInput
									id="shopPhone"
									type="tel"
									inputRef={phoneRef}
									defaultValue={data.getShop.phone}
									disabled={!canEdit}
									onBlur={handleShopFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="shopAddress" label="Address">
								<IBInput
									id="shopAddress"
									inputRef={addressRef}
									defaultValue={data.getShop.address}
									disabled={!canEdit}
									onBlur={handleShopFieldBlur}
								/>
							</FormField>
							<FormField id="shopCity" label="City">
								<IBInput
									id="shopCity"
									inputRef={cityRef}
									defaultValue={data.getShop.city}
									disabled={!canEdit}
									onBlur={handleShopFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="shopState" label="State">
								<IBInput
									id="shopState"
									inputRef={stateRef}
									defaultValue={data.getShop.state}
									disabled={!canEdit}
									onBlur={handleShopFieldBlur}
								/>
							</FormField>
							<FormField id="shopZip" label="Zip">
								<IBInput
									id="shopZip"
									inputRef={zipRef}
									defaultValue={data.getShop.zip}
									disabled={!canEdit}
									onBlur={handleShopFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="shopInstagram" label="Instagram">
								<IBInput
									id="shopInstagram"
									inputRef={instagramRef}
									defaultValue={data.getShop.instagram}
									disabled={!canEdit}
									onBlur={handleShopFieldBlur}
								/>
							</FormField>
							<FormField id="shopFacebook" label="Facebook">
								<IBInput
									id="shopFacebook"
									inputRef={facebookRef}
									defaultValue={data.getShop.facebook}
									disabled={!canEdit}
									onBlur={handleShopFieldBlur}
								/>
							</FormField>
						</div>
						<FormField id="shopWebsite" label="Website">
							<IBInput
								id="shopWebsite"
								inputRef={websiteRef}
								defaultValue={data.getShop.website}
								disabled={!canEdit}
								onBlur={handleShopFieldBlur}
							/>
						</FormField>
					</div>
				</div>
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
							disabled={!canEdit}
							onBlur={handleShopFieldBlur}
						/>
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