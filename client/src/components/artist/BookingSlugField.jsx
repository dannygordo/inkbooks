import React, { useEffect, useMemo, useState } from "react";
import { CircularProgress } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import IBInput from "../inputs/IBInput";
import { ArtistService } from "../../services/ArtistService";
import "./bookingSlugField.css";

/**
 * The artist's public booking link, with a live availability check.
 *
 * Checked as you type rather than on submit, because the failure mode this replaces is the one
 * where you fill in a whole form, hit save, and are told the one field you can't easily change
 * your mind about is taken. A handle is a naming decision - people try three or four before they
 * settle - and each retry costing a full submit is what makes that miserable.
 *
 * The check here is a COURTESY. The server re-validates on write and the unique index on
 * Artist.bookingSlug is the actual guarantee; two people typing the same link in the same second
 * both see a tick and one of them loses at save time, with a real error on the right field. This
 * being advisory is the reason it's allowed to be debounced and racy.
 */

// Shown under the field so the artist sees the actual URL rather than an abstract "handle".
// window.location.origin rather than a configured constant: this is the host they're already
// looking at, which is the host the link will be on.
const bookingOrigin = () =>
	typeof window !== "undefined" && window.location ? window.location.origin : "";

const BookingSlugField = ({
	value,
	setValue,
	error,
	label = "Booking link",
	// The artist's own current slug, when editing rather than creating. Re-saving a profile
	// without touching this field must not report their own link as taken.
	currentSlug = null,
	helperText,
}) => {
	const [checkSlug, { data, loading }] = ArtistService.useCheckBookingSlug();
	const [touched, setTouched] = useState(false);

	// Normalised the same way the server does (utils/booking-slug.js), so the preview URL and the
	// availability answer describe the value that will actually be stored - not the raw keystrokes.
	const normalized = useMemo(() => (value || "").trim().toLowerCase(), [value]);
	const unchanged = currentSlug !== null && normalized === String(currentSlug || "").toLowerCase();

	useEffect(() => {
		if (!normalized || unchanged) {
			return undefined;
		}
		// Debounced. Firing per keystroke would burn the server's rate limit on a single artist
		// typing one word, and every intermediate prefix is an answer nobody asked for.
		const timer = setTimeout(() => {
			checkSlug({ variables: { slug: normalized } });
		}, 350);
		return () => clearTimeout(timer);
	}, [normalized, unchanged, checkSlug]);

	// Guarded against a stale response, the same way AppointmentWizard's client lookup is: the
	// query is debounced and asynchronous, so an answer about a previously-typed slug can land
	// after the field has moved on. Without this the tick could describe a different word.
	const result =
		data?.checkBookingSlugAvailable?.slug === normalized
			? data.checkBookingSlugAvailable
			: null;

	const showStatus = touched && normalized && !unchanged;

	let statusNode = null;
	if (showStatus && loading) {
		statusNode = (
			<span className="bookingSlugStatus">
				<CircularProgress size={14} /> Checking…
			</span>
		);
	} else if (showStatus && result?.available) {
		statusNode = (
			<span className="bookingSlugStatus bookingSlugStatusOk">
				<CheckCircleOutlineIcon fontSize="small" /> Available
			</span>
		);
	} else if (showStatus && result && !result.available) {
		statusNode = (
			<span className="bookingSlugStatus bookingSlugStatusBad">
				<ErrorOutlineIcon fontSize="small" /> {result.reason}
			</span>
		);
	}

	return (
		<div className="bookingSlugField">
			<IBInput
				id="bookingSlug"
				label={label}
				defaultValue={value || ""}
				error={Boolean(error) || Boolean(showStatus && result && !result.available)}
				helperText={error || helperText || " "}
				onChange={(e) => {
					setTouched(true);
					setValue(e.target.value);
				}}
			/>
			{/* The whole point of the field, spelled out. An artist choosing a handle is choosing
			    what to print on a card; showing the abstract word without the URL around it asks
			    them to imagine the result. */}
			<div className="bookingSlugPreview">
				<span className="bookingSlugPreviewUrl">
					{bookingOrigin()}/book/
					<strong>{normalized || "your-name"}</strong>
				</span>
				{statusNode}
			</div>
		</div>
	);
};

export default BookingSlugField;
