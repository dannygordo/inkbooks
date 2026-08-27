import React from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@apollo/client";
import ShopService from "../../services/ShopService";
import FormService from "../../services/FormService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBInput from "../inputs/IBInput";
import { ALERT_CONSTANTS } from "../../constants";
import { useAuth } from "../../context/auth";
import { formUrl } from "../../utils/bookingSlug";

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
 * artist's own lives here; name, address, logo and the rest stay on /shop/:shopId (inline
 * autosave editing there now, not a separate /shop/edit/:shopId route - that route is gone) and
 * are linked to rather than duplicated. The tax rate and processing offset are NOT here either -
 * they are in SquarePricingPanel, which already resolves to the shop for a connected artist and
 * to the artist otherwise, so duplicating them by scope would mean two panels writing one pair of
 * fields.
 *
 * THE SHOP CUT PERCENTAGE USED TO BE A SECOND EXCEPTION to that rule - editable here AND on
 * /shop/:shopId, one stored field with two independent editors and two independent save states
 * (HANDOFF.md carried this as a known gap). Collapsed to one: this is now the ONLY place it's
 * editable. /shop/:shopId shows it read-only with a link back here - see that file's own comment.
 */
const ShopPanel = ({ shopId, shopName }) => {
	const { setAlert } = useAuth();
	const [updateShop] = useMutation(ShopService.updateShop());
	const [updateFormSlug, { loading: savingSlug }] = useMutation(
		ShopService.UPDATE_MY_SHOP_FORM_SLUG_MUTATION
	);
	const { loading, data } = ShopService.fetchShop(shopId);
	// shopUseOnly forms only - see server/utils/public-form-lookup.js: a shop-wide link
	// (/<formSlug>/<shop.formSlug>) only ever resolves for forms marked shopUseOnly, same forms
	// that getMyFormLinks (used by FormsPanel's per-artist link list) deliberately excludes.
	const { data: formsData } = FormService.getForms({ shopId }, "published");
	const [editedCut, setEditedCut] = React.useState(undefined);
	const [saveState, setSaveState] = React.useState("idle");
	const [editedFormSlug, setEditedFormSlug] = React.useState(undefined);
	const [formSlugSaveState, setFormSlugSaveState] = React.useState("idle");
	const [copiedSlug, setCopiedSlug] = React.useState(null);

	if (loading || !data?.getShop) {
		return null;
	}

	const shop = data.getShop;
	const cutValue = editedCut !== undefined ? editedCut : String(shop.shopCutPercent ?? 0);
	const formSlugValue = editedFormSlug !== undefined ? editedFormSlug : shop.formSlug || "";
	const shopWideLinks = (formsData?.getForms?.items || []).filter((f) => f.shopUseOnly);

	const handleFormSlugBlur = async () => {
		const normalized = formSlugValue.trim().toLowerCase();
		if (normalized === (shop.formSlug || "")) {
			setFormSlugSaveState("idle");
			return;
		}
		if (!normalized) {
			setFormSlugSaveState("idle");
			return;
		}
		setFormSlugSaveState("saving");
		try {
			await updateFormSlug({ variables: { shopId, slug: normalized } });
			setFormSlugSaveState("saved");
		} catch (err) {
			setFormSlugSaveState("error");
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.graphQLErrors?.[0]?.extensions?.errors?.slug || err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	const handleCopy = (slug) => {
		navigator.clipboard
			?.writeText(formUrl(slug, shop.formSlug))
			.then(() => {
				setCopiedSlug(slug);
				setTimeout(() => setCopiedSlug(null), 2000);
			})
			.catch(() => setCopiedSlug(null));
	};

	// Saved on blur, matching the autosave convention every other editable field in the app uses
	// (Project's Details panel, Shop's own name/contact fields) rather than a separate Save
	// button for just this one setting.
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

			{/* The shop's own handle - see server/utils/public-form-lookup.js: this is the
			    <ownerHandle> half of a "shop use only" form's link (/<formSlug>/<shop.formSlug>),
			    the shop-wide counterpart to an individual artist's Artist.bookingSlug. Only
			    meaningful once the shop actually has a shop-use-only form to link to, but editable
			    ahead of that so a shop can pick and reserve its handle early. */}
			<IBInput
				id="shopFormSlug"
				label="Shop link"
				defaultValue={formSlugValue}
				onChange={(e) => setEditedFormSlug(e.target.value)}
				onBlur={handleFormSlugBlur}
				disabled={savingSlug}
				helperText="Lowercase letters, numbers and hyphens - used for forms shared shop-wide, not tied to one artist."
			/>
			<span className={`settingsSaveState settingsSaveState--${formSlugSaveState}`}>
				{formSlugSaveState === "saving" && "Saving..."}
				{formSlugSaveState === "saved" && "Saved"}
				{formSlugSaveState === "error" && "That link couldn't be saved - it may already be taken."}
			</span>

			{shop.formSlug && shopWideLinks.length > 0 && (
				<div className="formLinksList">
					{shopWideLinks.map((form) => (
						<div className="formLinksRow" key={form.id}>
							<span className="formLinksRowLabel">{form.title}</span>
							<span className="formLinksRowUrl">{formUrl(form.slug, shop.formSlug)}</span>
							<button
								className="ibButtonSecondary"
								type="button"
								onClick={() => handleCopy(form.slug)}
							>
								{copiedSlug === form.slug ? "Copied" : "Copy"}
							</button>
						</div>
					))}
				</div>
			)}

			{/* Everything else about the shop stays where it is. A link beats a second copy of a
			    form - two editors for a name is how two shops end up with different ones. Used to
			    be a second link straight to /shop/edit/:shopId - that route (and page) are gone,
			    its fields are now inline autosave editing on /shop/:shopId itself, so "view" and
			    "edit" are the same destination and one link covers both. */}
			<div className="settingsActions">
				<Link className="ibButtonSecondary" to={`/shop/${shopId}`}>
					Shop page
				</Link>
			</div>
		</IBCardWrapper>
	);
};

export default ShopPanel;
