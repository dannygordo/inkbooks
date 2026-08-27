import React, { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { Button } from "@mui/material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import BookingSlugField from "../artist/BookingSlugField";
import { ArtistService } from "../../services/ArtistService";
import FormService from "../../services/FormService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import { formUrl } from "../../utils/bookingSlug";

/**
 * Task #163 - Settings > Forms. Folds in what used to be the separate "Booking" category
 * (BookingLinkPanel.jsx, now unused - see settingsCategories.jsx's own comment on why that file is
 * left in place rather than deleted) because the artist's own link is no longer just a booking
 * link: the exact same Artist.bookingSlug is now the <ownerHandle> half of EVERY form's public URL
 * (/<formSlug>/<ownerHandle> - see server/utils/public-form-lookup.js), booking_request included.
 * "Booking link" is renamed "Your link" here for that reason.
 *
 * TWO SECTIONS, gated separately - see settingsCategories.jsx's isVisible for this category:
 *   - "Your link" + the URL list: visible to every ARTIST (isArtist), shop-affiliated or not -
 *     matches BookingLinkPanel's old gate exactly, no regression for a plain shop-connected
 *     artist who was never shop_admin. Uses getMyFormLinks (self-scoped, see
 *     resolvers/forms.js), not getForms - a plain artist has no authority to call getForms with a
 *     shopId scope at all.
 *   - "Manage Forms" on-ramp: visible only to hasAuditAuthority (shop_admin-or-better, or an
 *     independent artist) - the same floor the /forms management page itself is gated by.
 */
const FormsPanel = () => {
	const { user, setAlert } = useAuth();
	const isArtist = Boolean(user.userInfo) && user.userType === "artist";
	const isShopAdminOrBetter = user.role <= 10;
	const hasShop = Boolean(user.userInfo?.shop?.id);
	const canManageForms = isShopAdminOrBetter || !hasShop;

	const artistUserInfoId = user.userInfo ? user.userInfo.id : null;
	const { data: artistData } = ArtistService.fetchArtist(artistUserInfoId);
	const { data: linksData } = FormService.getMyFormLinks({ skip: !isArtist });

	const [editedSlug, setEditedSlug] = useState(undefined);
	const [copiedSlug, setCopiedSlug] = useState(null);
	const currentSlug = artistData?.getArtist?.bookingSlug || "";
	const slugValue = editedSlug !== undefined ? editedSlug : currentSlug;
	const slugChanged = slugValue.trim().toLowerCase() !== currentSlug.toLowerCase();

	const [updateMyBookingSlug, { loading: savingSlug }] = useMutation(
		ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION
	);

	const handleSaveSlug = (e) => {
		e.preventDefault();
		updateMyBookingSlug({ variables: { slug: slugValue.trim().toLowerCase() } })
			.then(() => {
				setEditedSlug(undefined);
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
					message: "Your link has been saved.",
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			})
			.catch((err) => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: err.graphQLErrors?.[0]?.extensions?.errors?.bookingSlug || err.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			});
	};

	const handleCopy = (slug) => {
		navigator.clipboard
			?.writeText(formUrl(slug, currentSlug))
			.then(() => {
				setCopiedSlug(slug);
				setTimeout(() => setCopiedSlug(null), 2000);
			})
			.catch(() => setCopiedSlug(null));
	};

	const links = linksData?.getMyFormLinks || [];

	return (
		<>
			{isArtist && (
				<IBCardWrapper>
					<div>
						<h1>Your link</h1>
						<p className="settingsPanelHelp">
							The one handle every one of your form links is built from - booking
							requests, consent forms, and anything else you publish. Share the
							specific link for whichever form you mean below; this field only sets
							the shared part.
						</p>
						<BookingSlugField
							value={slugValue}
							setValue={setEditedSlug}
							currentSlug={currentSlug}
							helperText="Lowercase letters, numbers and hyphens."
						/>
						<div className="settingsActions">
							<button
								className="ibButton"
								disabled={savingSlug || !slugChanged}
								onClick={handleSaveSlug}
							>
								{savingSlug ? "Saving..." : "Save link"}
							</button>
						</div>

						{currentSlug && (
							<div className="formLinksList">
								{links.length === 0 && (
									<p className="settingsPanelHelp">
										No published forms have a link yet - publish a form and give
										it a link (Forms &gt; a form &gt; Link) to see it here.
									</p>
								)}
								{links.map((link) => (
									<div className="formLinksRow" key={link.slug}>
										<span className="formLinksRowLabel">{link.title}</span>
										<span className="formLinksRowUrl">{formUrl(link.slug, currentSlug)}</span>
										<button
											className="ibButtonSecondary"
											type="button"
											onClick={() => handleCopy(link.slug)}
										>
											{copiedSlug === link.slug ? "Copied" : "Copy"}
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</IBCardWrapper>
			)}

			{canManageForms && (
				<IBCardWrapper>
					<h1>Manage Forms</h1>
					<p className="settingsPanelHelp">
						Consent forms, waivers, and custom intake questionnaires - plus the
						Booking Request form's own intake fields. Build a form, publish it, and
						give it a link so it shows up above.
					</p>
					<div className="settingsActions">
						<Button variant="contained" component={RouterLink} to={ROUTE_CONSTANTS.FORMS}>
							Manage Forms
						</Button>
					</div>
				</IBCardWrapper>
			)}
		</>
	);
};

export default FormsPanel;
