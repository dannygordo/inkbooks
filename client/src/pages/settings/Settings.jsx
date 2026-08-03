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
import { ALERT_CONSTANTS, APP_SETTINGS_CONSTANTS } from "../../constants";

// New top-level settings section - see PRODUCTION_ROADMAP.md's "Rates & settings" entry for why
// this didn't just get bolted onto Profile.jsx: it's going to keep growing (rate config today,
// likely notification prefs/shop-connection management later), and Profile.jsx already carries
// avatar/password/tag-color. First (and only, for now) content: an artist's own hourlyRate/
// flatRate/billingType, plus - when the artist is shop-connected - which side's rate actually
// applies (ArtistShopConnection.rateSource).
const Settings = () => {
	const { user, setAlert } = useAuth();
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

	if (!isArtist) {
		return (
			<div className="settings">
				<h1 className="settingsTitle">Settings</h1>
				<p>Nothing to configure here yet for this account type.</p>
			</div>
		);
	}

	if (artistLoading || connectionsLoading) {
		return <IBPageLoader />;
	}

	return (
		<div className="settings">
			<div className="settingsTitleContainer">
				<h1 className="settingsTitle">Settings</h1>
			</div>
			<div className="settingsContainer">
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
