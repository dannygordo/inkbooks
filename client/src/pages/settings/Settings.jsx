import React, { useEffect, useState } from "react";
import { useMutation } from "@apollo/client";
import "./settings.css";
import { useAuth } from "../../context/auth";
import IBCardWrapper from "../../components/card/ibCard/IBCardWrapper";
import IBInput from "../../components/inputs/IBInput";
import IBSelect from "../../components/inputs/IBSelect";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import { ArtistService } from "../../services/ArtistService";
import ArtistShopConnectionService from "../../services/ArtistShopConnectionService";
import ShopService from "../../services/ShopService";
import { ALERT_CONSTANTS, APP_SETTINGS_CONSTANTS } from "../../constants";
import BookingSlugField from "../../components/artist/BookingSlugField";
import NotificationSettingsPanel from "../../components/notifications/NotificationSettingsPanel";
import AccountPanel from "../../components/settings/AccountPanel";
import { bookingUrl } from "../../utils/bookingSlug";

// New top-level settings section - see PRODUCTION_ROADMAP.md's "Rates & settings" entry for why
// this didn't just get bolted onto Profile.jsx: it's going to keep growing (rate config today,
// likely notification prefs/shop-connection management later), and Profile.jsx already carries
// avatar/password/tag-color. First (and only, for now) content: an artist's own hourlyRate/
// flatRate/billingType, plus - when the artist is shop-connected - which side's rate actually
// applies (ArtistShopConnection.rateSource).
const Settings = () => {
	const { user, setAlert, updateCurrentUser } = useAuth();
	const isArtist = user.userInfo && user.userType === "artist";
	const artistUserInfoId = isArtist ? user.userInfo.id : null;
	// Note: getArtistShopConnections expects the artist's *User* id (user.id), not the Artist
	// collection's own _id (user.userInfo.id) - see models/ArtistShopConnection.js's own comment
	// on this exact distinction, and resolvers/artistShopConnections.js's ownership check, which
	// compares against user.id.
	const shopId = user.userInfo?.shop?.id;

	const { loading: artistLoading, data: artistData } = ArtistService.fetchArtist(artistUserInfoId);
	const { loading: connectionsLoading, data: connectionsData } =
		ArtistShopConnectionService.fetchArtistShopConnections(isArtist ? user.id : null);

	// --- Shop affiliation: which shop (if any) this artist belongs to, plus connect/disconnect -
	// there was previously no client UI for this at all (see ArtistShopConnectionService.js's own
	// comment - connectArtistToShop/disconnectArtistFromShop existed server-side with no caller).
	const [shopIdToConnect, setShopIdToConnect] = useState("");
	const [shopActionError, setShopActionError] = useState(null);
	// Set when the server refuses a connect because it would move this artist off their current
	// shop. Holds the shop names involved so the confirmation can name them - null the rest of the
	// time, which is also what closes the dialog.
	const [pendingTransfer, setPendingTransfer] = useState(null);
	const [showMoveForm, setShowMoveForm] = useState(false);
	const [connectArtistToShop, { loading: connecting }] = useMutation(
		ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION
	);
	const [disconnectArtistFromShop, { loading: disconnecting }] = useMutation(
		ArtistShopConnectionService.DISCONNECT_ARTIST_FROM_SHOP_MUTATION
	);
	// Lazy, not eager - connectArtistToShop's own response has no shop name/website to show (just
	// the raw ArtistShopConnection record), so this is triggered manually right after a successful
	// connect to fetch those two fields and update the cached user with them.
	const [fetchShopName] = ShopService.useLazyShop();

	// Shared by the first attempt and the confirmed retry - the only difference between them is
	// confirmTransfer, so the success path isn't written twice.
	const runConnect = async (targetShopId, confirmTransfer) => {
		await connectArtistToShop({
			variables: { artistId: user.id, shopId: targetShopId, confirmTransfer },
		});
		const { data } = await fetchShopName({ variables: { shopId: targetShopId } });
		updateCurrentUser({
			...user,
			userInfo: {
				...user.userInfo,
				shop: data?.getShop
					? { id: data.getShop.id, name: data.getShop.name, website: data.getShop.website }
					: { id: targetShopId },
			},
		});
		setShopIdToConnect("");
		setPendingTransfer(null);
		setShowMoveForm(false);
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message: "Connected to shop.",
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	const handleConnectToShop = async (e) => {
		e.preventDefault();
		setShopActionError(null);
		const trimmedShopId = shopIdToConnect.trim();
		if (!trimmedShopId) {
			setShopActionError("Enter the Shop ID your shop gave you.");
			return;
		}
		try {
			await runConnect(trimmedShopId, false);
		} catch (err) {
			// An artist works at one shop at a time, so connecting somewhere new ends the current
			// connection. The server refuses the first attempt and hands back which shop is being
			// left; this turns that into a confirmation naming both shops rather than a generic
			// "are you sure". See mutations/artistShopConnections.js.
			const transfer = err.graphQLErrors?.[0]?.extensions?.transfer;
			if (transfer?.requiresConfirmation) {
				setPendingTransfer({ ...transfer, targetShopId: trimmedShopId });
				return;
			}
			setShopActionError(err.graphQLErrors?.[0]?.message || err.message);
		}
	};

	const handleConfirmTransfer = async () => {
		const target = pendingTransfer;
		setShopActionError(null);
		try {
			await runConnect(target.targetShopId, true);
		} catch (err) {
			setPendingTransfer(null);
			setShopActionError(err.graphQLErrors?.[0]?.message || err.message);
		}
	};

	const handleDisconnectFromShop = async () => {
		if (
			!window.confirm(
				`Disconnect from ${user.userInfo?.shop?.name || "this shop"}? You can reconnect later.`
			)
		) {
			return;
		}
		try {
			await disconnectArtistFromShop({ variables: { artistId: user.id, shopId } });
			updateCurrentUser({
				...user,
				userInfo: { ...user.userInfo, shop: null },
			});
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: "Disconnected from shop.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		} catch (err) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.graphQLErrors?.[0]?.message || err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	// Deliberately not hydrated into state via a useEffect keyed on the query result - IBInput
	// is an uncontrolled component (defaultValue, not value - see IBInput.jsx's own prop list),
	// so a value set by an effect after the query resolves would update this state but never
	// actually update what's rendered in the field, since defaultValue is only read once at
	// mount. Same reasoning EditArtist.jsx already follows: read straight from the query result
	// at render time for defaultValue, and only use local state to capture *edits*, falling back
	// to the query's own value for anything the user hasn't touched yet.
	const [editedHourlyRate, setEditedHourlyRate] = useState(undefined);
	const [editedFlatRate, setEditedFlatRate] = useState(undefined);
	const [billingType, setBillingType] = useState("hourly");
	const [rateSource, setRateSource] = useState("shop");
	const [billingTypeHydrated, setBillingTypeHydrated] = useState(false);
	const [rateSourceHydrated, setRateSourceHydrated] = useState(false);

	// Same uncontrolled-with-local-edits shape as the rate fields above: fall back to the query's
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

	const [updateArtistRateSettings, { loading: savingRates }] = useMutation(
		ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION
	);
	const [setArtistShopRateSource, { loading: savingRateSource }] = useMutation(
		ArtistShopConnectionService.SET_ARTIST_SHOP_RATE_SOURCE_MUTATION
	);

	// billingType/rateSource use IBSelect/plain radios, both properly controlled components (see
	// IBSelect.jsx's `value={selectedVal}`) - unlike hourlyRate/flatRate above, hydrating these
	// once from the query result on first load is safe and simple.
	useEffect(() => {
		if (artistData && artistData.getArtist && !billingTypeHydrated) {
			setBillingType(artistData.getArtist.billingType || "hourly");
			setBillingTypeHydrated(true);
		}
	}, [artistData, billingTypeHydrated]);

	useEffect(() => {
		if (connectionsData && connectionsData.getArtistShopConnections && shopId && !rateSourceHydrated) {
			const activeConnection = connectionsData.getArtistShopConnections.find(
				(c) => c.status === "active" && String(c.shopId) === String(shopId)
			);
			if (activeConnection) {
				setRateSource(activeConnection.rateSource);
			}
			setRateSourceHydrated(true);
		}
	}, [connectionsData, shopId, rateSourceHydrated]);

	const handleSaveRates = (e) => {
		e.preventDefault();
		const hourlyRateToSave =
			editedHourlyRate !== undefined ? editedHourlyRate : artistData?.getArtist?.hourlyRate;
		const flatRateToSave =
			editedFlatRate !== undefined ? editedFlatRate : artistData?.getArtist?.flatRate;
		updateArtistRateSettings({
			variables: {
				hourlyRate:
					hourlyRateToSave === "" || hourlyRateToSave === undefined || hourlyRateToSave === null
						? null
						: parseInt(hourlyRateToSave, 10),
				flatRate:
					flatRateToSave === "" || flatRateToSave === undefined || flatRateToSave === null
						? null
						: parseInt(flatRateToSave, 10),
				billingType,
			},
		})
			.then(() => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
					message: "Rate settings saved.",
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			})
			.catch((err) => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: err.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			});
	};

	const handleRateSourceChange = (value) => {
		setRateSource(value);
		setArtistShopRateSource({
			variables: { artistId: user.id, shopId, rateSource: value },
		})
			.then(() => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
					message: "Rate source updated.",
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			})
			.catch((err) => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: err.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			});
	};

	// A non-artist - shop staff - still gets the account panel.
	//
	// This used to say "Nothing to configure here yet for this account type" and stop, which was
	// true only while their photo and password lived on a separate /profile page. With that page
	// merged in, returning early here would have quietly removed the only way for staff to change
	// their own password.
	if (!isArtist) {
		return (
			<div className="settings">
				<div className="settingsTitleContainer">
					<h1 className="settingsTitle">Settings</h1>
				</div>
				<div className="settingsContainer">
					<AccountPanel />
					<NotificationSettingsPanel />
				</div>
			</div>
		);
	}

	if (artistLoading || connectionsLoading) {
		return <IBPageLoader />;
	}

	// One form, rendered either as the first-time connect or as the move-shops form. IBInput is
	// uncontrolled (defaultValue only - see its own prop list), so onChange keeps shopIdToConnect
	// in sync and there's no value prop to feed back.
	const connectForm = (submitLabel) => (
		<form onSubmit={handleConnectToShop}>
			<IBInput
				id="shopIdToConnect"
				label="Shop ID"
				onChange={(e) => setShopIdToConnect(e.target.value)}
				placeholder="Ask your shop for their Shop ID"
			/>
			{shopActionError && <div className="settingsError">{shopActionError}</div>}
			<div className="settingsActions">
				<button type="submit" className="ibButton" disabled={connecting}>
					{connecting ? "Connecting..." : submitLabel}
				</button>
			</div>
		</form>
	);

	return (
		<div className="settings">
			<div className="settingsTitleContainer">
				<h1 className="settingsTitle">Settings</h1>
			</div>
			{/* Names both shops rather than warning generically. "You'll be disconnected from your
			    current shop" isn't something anyone can act on - the whole point of the
			    confirmation is that the person can see which shop they're about to lose. */}
			{pendingTransfer && (
				<div className="settingsConfirmBackdrop" role="dialog" aria-modal="true">
					<div className="settingsConfirmDialog">
						<h2>Move to {pendingTransfer.newShop?.name}?</h2>
						<p>
							You're currently connected to{" "}
							<strong>
								{pendingTransfer.currentShops?.map((c) => c.name).join(", ") ||
									"another shop"}
							</strong>
							.
						</p>
						<p>
							Connecting to <strong>{pendingTransfer.newShop?.name}</strong> will end that
							connection. You'll no longer be associated with{" "}
							{pendingTransfer.currentShops?.length === 1
								? pendingTransfer.currentShops[0].name
								: "your current shop"}
							, and their calendar, rates and shop-cut ledger will no longer apply to your
							work.
						</p>
						<p className="settingsConfirmNote">
							Your past appointments, projects and earnings stay exactly as they are.
						</p>
						<div className="settingsActions">
							<button
								type="button"
								className="ibButtonSecondary"
								onClick={() => setPendingTransfer(null)}
								disabled={connecting}
							>
								Cancel
							</button>
							<button
								type="button"
								className="ibButton"
								onClick={handleConfirmTransfer}
								disabled={connecting}
							>
								{connecting ? "Moving..." : "Continue"}
							</button>
						</div>
					</div>
				</div>
			)}
			<div className="settingsContainer">
				{/* Photo, password and calendar colour - was its own /profile page. First, because it is
				    the most-changed thing here and because "who am I" reads before "how do I charge". */}
				<AccountPanel />
				<IBCardWrapper>
					<div>
						<h1>Shop</h1>
						<h6 style={{ color: "#bbb", marginBottom: 15 }}>
							{shopId
								? "You're connected to this shop - your calendar, rate settings, and shop-cut ledger are all scoped to it."
								: "You're not currently connected to a shop - you're set up as an independent artist."}
						</h6>
					</div>
					{shopId ? (
						<div>
							<p className="settingsShopName">{user.userInfo?.shop?.name || "Connected shop"}</p>
							{user.userInfo?.shop?.website && (
								<p className="settingsShopWebsite">{user.userInfo.shop.website}</p>
							)}
							<div className="settingsActions">
								<button
									type="button"
									className="ibButton"
									onClick={handleDisconnectFromShop}
									disabled={disconnecting}
								>
									{disconnecting ? "Disconnecting..." : "Disconnect from Shop"}
								</button>
								{/* Moving shops without disconnecting first is the normal case - people
								    change shops, they don't think to file paperwork about leaving the
								    old one. This is the path that produces the transfer confirmation
								    below; without it the guard would only ever be reachable by an
								    admin, and an artist who moved would have to know to disconnect
								    first. */}
								{!showMoveForm && (
									<button
										type="button"
										className="ibButtonSecondary"
										onClick={() => {
											setShopActionError(null);
											setShowMoveForm(true);
										}}
									>
										Move to a Different Shop
									</button>
								)}
							</div>
							{showMoveForm && (
								<div style={{ marginTop: 20 }}>
									<h6 style={{ color: "#bbb", marginBottom: 15 }}>
										Connecting to a different shop ends your connection to{" "}
										{user.userInfo?.shop?.name || "your current shop"}.
									</h6>
									{connectForm("Move to This Shop")}
								</div>
							)}
						</div>
					) : (
						connectForm("Connect to Shop")
					)}
				</IBCardWrapper>

				{/* The artist's public booking page. Before this, the only way to reach one was
				    /book/<their Mongo ObjectId> - a real URL, and not one anybody can hand to a
				    client. Nothing in the app displayed it either, so an artist had no way to find
				    their own booking link at all. */}
				<NotificationSettingsPanel />

				<IBCardWrapper>
					<div>
						<h1>Booking link</h1>
						<h6 style={{ color: "#bbb", marginBottom: 15 }}>
							Share this with clients so they can send you booking requests. It shows
							your name and photo, and nothing else about your account.
						</h6>
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

				<IBCardWrapper>
					<div>
						<h1>Rates</h1>
						<h6 style={{ color: "#bbb", marginBottom: 15 }}>
							Used to auto-compute a session's total from time worked - can always be
							edited by hand on the session itself.
						</h6>
					</div>
					<form onSubmit={handleSaveRates}>
						<IBSelect
							data={APP_SETTINGS_CONSTANTS.BILLING_TYPE}
							label="Billing Type"
							selectedVal={billingType}
							onChange={(e) => setBillingType(e.target.value)}
						/>
						<IBInput
							id="hourlyRate"
							label="Hourly Rate ($)"
							type="number"
							defaultValue={artistData?.getArtist?.hourlyRate ?? ""}
							onChange={(e) => setEditedHourlyRate(e.target.value)}
							placeholder="150"
						/>
						<IBInput
							id="flatRate"
							label="Flat Rate ($)"
							type="number"
							defaultValue={artistData?.getArtist?.flatRate ?? ""}
							onChange={(e) => setEditedFlatRate(e.target.value)}
							placeholder="500"
						/>
						<div className="settingsActions">
							<button
								type="submit"
								className="ibButton"
								disabled={savingRates}
							>
								{savingRates ? "Saving..." : "Save Rates"}
							</button>
						</div>
					</form>
				</IBCardWrapper>

				{shopId && (
					<IBCardWrapper>
						<div>
							<h1>Which Rate Applies</h1>
							<h6 style={{ color: "#bbb", marginBottom: 15 }}>
								At your connected shop, sessions can bill against the shop's rate or
								your own.
							</h6>
						</div>
						<div className="settingsRadioGroup">
							<label>
								<input
									type="radio"
									name="rateSource"
									checked={rateSource === "shop"}
									disabled={savingRateSource}
									onChange={() => handleRateSourceChange("shop")}
								/>{" "}
								Use the shop's rate
							</label>
							<label>
								<input
									type="radio"
									name="rateSource"
									checked={rateSource === "own"}
									disabled={savingRateSource}
									onChange={() => handleRateSourceChange("own")}
								/>{" "}
								Use my own rate
							</label>
						</div>
					</IBCardWrapper>
				)}
			</div>
		</div>
	);
};

export default Settings;
