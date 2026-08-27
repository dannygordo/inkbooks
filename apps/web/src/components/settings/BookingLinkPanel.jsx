import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import BookingSlugField from "../artist/BookingSlugField";
import { ArtistService } from "../../services/ArtistService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { bookingUrl } from "../../utils/bookingSlug";

/**
 * The artist's public booking page. Before this existed on Settings, the only way to reach one was
 * /book/<their Mongo ObjectId> - a real URL, and not one anybody can hand to a client. Nothing in
 * the app displayed it either, so an artist had no way to find their own booking link at all.
 *
 * Extracted from Settings.jsx - see pages/settings/settingsCategories.js for why Settings is now
 * one component per category rather than one file owning everything.
 */
const BookingLinkPanel = () => {
	const { user, setAlert } = useAuth();
	const artistUserInfoId = user.userInfo ? user.userInfo.id : null;
	const { data: artistData } = ArtistService.fetchArtist(artistUserInfoId);

	// Same uncontrolled-with-local-edits shape used throughout this page: fall back to the query's
	// own value for anything untouched, so a slow fetch doesn't blank the field.
	const [editedSlug, setEditedSlug] = useState(undefined);
	const [copiedLink, setCopiedLink] = useState(false);
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
					message: "Booking link saved.",
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			})
			.catch((err) => {
				// Surfaced rather than swallowed: "that link is taken" is the single most likely
				// outcome of this form, and it's the one the artist needs to act on.
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message:
						err.graphQLErrors?.[0]?.extensions?.errors?.bookingSlug || err.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			});
	};

	const handleCopyBookingLink = () => {
		// navigator.clipboard is unavailable over plain http on anything but localhost, so this
		// can genuinely fail in a LAN test setup. Reverting the label is a truthful "it didn't
		// work" rather than a tick over nothing on the clipboard.
		navigator.clipboard
			?.writeText(bookingUrl(currentSlug))
			.then(() => {
				setCopiedLink(true);
				setTimeout(() => setCopiedLink(false), 2000);
			})
			.catch(() => setCopiedLink(false));
	};

	return (
		<IBCardWrapper>
			<div>
				<h1>Booking link</h1>
				<p className="settingsPanelHelp">
					Share this with clients so they can send you booking requests. It shows your
					name and photo, and nothing else about your account.
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
					{currentSlug && (
						<button
							className="ibButtonSecondary"
							onClick={handleCopyBookingLink}
							type="button"
						>
							{copiedLink ? "Copied" : "Copy link"}
						</button>
					)}
				</div>
			</div>
		</IBCardWrapper>
	);
};

export default BookingLinkPanel;
