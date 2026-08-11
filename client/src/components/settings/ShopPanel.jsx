import React from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@apollo/client";
import ShopService from "../../services/ShopService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBInput from "../inputs/IBInput";

/**
 * Shop-wide configuration, for an owner who is also an artist.
 *
 * WHY THIS IS ON THE SETTINGS PAGE AT ALL. A shop's first account is a SHOP_ADMIN whose userType is
 * ARTIST - registerAccount sets it deliberately, on the grounds that "a shop owner tattoos until
 * they say otherwise". So the same person has personal settings (their rates, their booking link)
 * and shop settings (the cut, the tax rate), and until now those lived on unrelated pages reached
 * through a directory list of one shop. They do not experience "me" and "my shop" as two products.
 *
 * NOT A SECOND COPY OF THE SHOP PAGE. Only the money configuration that belongs beside the
 * artist's own lives here; name, address, logo and the rest stay on /shop/edit/:shopId and are
 * linked to rather than duplicated. The tax rate and processing offset are NOT here either - they
 * are in SquarePricingPanel, which already resolves to the shop for a connected artist and to the
 * artist otherwise, so duplicating them by scope would mean two panels writing one pair of fields.
 *
 * KNOWN DUPLICATION, deliberate for now: the shop cut percentage is also editable on
 * /shop/:shopId. One stored field, two editors - a UX duplication rather than a second source of
 * truth, and worth collapsing when the shop pages are next touched.
 */
const ShopPanel = ({ shopId, shopName }) => {
	const [updateShop] = useMutation(ShopService.updateShop());
	const { loading, data } = ShopService.fetchShop(shopId);
	const [editedCut, setEditedCut] = React.useState(undefined);
	const [saveState, setSaveState] = React.useState("idle");

	if (loading || !data?.getShop) {
		return null;
	}

	const shop = data.getShop;
	const cutValue = editedCut !== undefined ? editedCut : String(shop.shopCutPercent ?? 0);

	// Saved on blur, matching the autosave the shop page already uses for this field rather than
	// introducing a second interaction for the same setting.
	const handleCutBlur = async () => {
		const parsed = parseInt(cutValue, 10);
		if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
			setSaveState("error");
			return;
		}
		if (parsed === (shop.shopCutPercent ?? 0)) {
			setSaveState("idle");
			return;
		}
		setSaveState("saving");
		try {
			await updateShop({ variables: { shop: { id: shopId, shopCutPercent: parsed } } });
			setSaveState("saved");
		} catch (err) {
			setSaveState("error");
		}
	};

	return (
		<IBCardWrapper>
			<div>
				<h1>Shop</h1>
				<p className="settingsPanelHelp">
					Settings for {shopName || shop.name}, applied to every artist working there.
				</p>
			</div>

			<IBInput
				id="shopCutPercent"
				label="Shop cut (%)"
				type="number"
				inputProps={{ step: 1, min: 0, max: 100 }}
				defaultValue={cutValue}
				onChange={(e) => setEditedCut(e.target.value)}
				onBlur={handleCutBlur}
				helperText="Taken from the tattoo work only - never from tips, tax or processing fees."
			/>
			<span className={`settingsSaveState settingsSaveState--${saveState}`}>
				{saveState === "saving" && "Saving..."}
				{saveState === "saved" && "Saved"}
				{saveState === "error" && "Enter a whole number between 0 and 100"}
			</span>

			{/* Everything else about the shop stays where it is. A link beats a second copy of a
			    form - two editors for a name is how two shops end up with different ones. */}
			<div className="settingsActions">
				<Link className="ibButtonSecondary" to={`/shop/${shopId}`}>
					Shop page
				</Link>
				<Link className="ibButtonSecondary" to={`/shop/edit/${shopId}`}>
					Edit shop details
				</Link>
			</div>
		</IBCardWrapper>
	);
};

export default ShopPanel;
