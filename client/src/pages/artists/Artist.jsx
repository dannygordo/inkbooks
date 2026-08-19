import { useParams } from "react-router-dom";
import { useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import "./artist.css";
import { ArtistService } from "../../services/ArtistService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBAvatar from "../../components/inputs/IBAvatar";
import IBCardWrapper from "../../components/card/ibCard/IBCardWrapper";
import IBInput from "../../components/inputs/IBInput";
import FormField from "../../components/formField/FormField";
import ArtistPerformancePanel from "../../components/artistDashboard/ArtistPerformancePanel";
import ShopCutRatePanel from "../../components/artistDashboard/ShopCutRatePanel";
import { useAuth } from "../../context/auth";
import { ROLES } from "../../constants";
import ArchiveControl from "../../components/archive/ArchiveControl";
import { ARTIST_STATUS, ALERT_CONSTANTS } from "../../constants";

// Was a name and an "Edit Artist" button with nothing else - this is the shop's management view
// into one specific artist (as opposed to Home.jsx, which is an artist's view of their own
// numbers) - see PRODUCTION_ROADMAP.md for why the same ArtistPerformancePanel is mounted in both
// places with different framing rather than built twice.
const Artist = (props) => {
	let params = useParams();
	// The VIEWER, not the artist being viewed - the two are the same person when an artist opens
	// their own page, which is exactly the case the rate panel has to tell apart.
	const { user, setAlert, updateCurrentUser } = useAuth();
	/**
	 * Gets artist by id
	 */
	const { loading, data, refetch } = ArtistService.fetchArtist(params.artistId);

	const [updateArtist] = useMutation(ArtistService.updateArtist());
	const firstNameRef = useRef();
	const lastNameRef = useRef();
	const emailRef = useRef();
	const phoneRef = useRef();
	const titleRef = useRef();
	const addressRef = useRef();
	const cityRef = useRef();
	const stateRef = useRef();
	const zipRef = useRef();
	const startDateRef = useRef();
	const instagramRef = useRef();
	const facebookRef = useRef();
	const lastSavedIdentityRef = useRef(null);
	const [identitySaveState, setIdentitySaveState] = useState("idle");

	// The corner "Edit" button is gone from every detail page. It was a fixed action in the top
	// right of a record that didn't say what it edited or where it went, and it was the only way
	// in - so viewing and editing were two separate destinations for the same record, with a
	// round trip between them. Rows now lead straight to the record, and editing belongs beside
	// the thing being edited rather than in a corner. The edit ROUTES are untouched and still
	// reachable directly; only the corner button is removed.
	//
	// updateArtist's real authorization rule (assertCanManageArtist, server/utils/shop-membership.js)
	// is "the artist themselves, or someone SHOP_ADMIN-or-better who shares a shop with them" - the
	// exact same self-or-admin shape ShopCutRatePanel's own canEdit already expresses below for the
	// rate history, just without that panel's extra "and it isn't you" clause (a rate is something
	// someone else sets for you; your own name and phone number are not). The shop-sharing half of
	// the real rule isn't checked here, the same simplification ShopCutRatePanel already makes -
	// this page has no cheap way to know that client-side, and the mutation is the actual gate: a
	// blocked save fails loudly (see handleIdentityFieldBlur's catch) rather than silently.
	const isSelf = data?.getArtist ? String(user.id) === String(data.getArtist.userId) : false;
	const canEditIdentity = isSelf || user.role <= ROLES.SHOP_ADMIN;

	const buildIdentityPayload = () => ({
		id: data.getArtist.id,
		firstName: firstNameRef.current?.value ?? data.getArtist.firstName,
		lastName: lastNameRef.current?.value ?? data.getArtist.lastName,
		email: emailRef.current?.value ?? data.getArtist.email,
		phone: phoneRef.current?.value ?? data.getArtist.phone,
		title: titleRef.current?.value ?? data.getArtist.title,
		address: addressRef.current?.value ?? data.getArtist.address,
		city: cityRef.current?.value ?? data.getArtist.city,
		state: stateRef.current?.value ?? data.getArtist.state,
		zip: zipRef.current?.value ?? data.getArtist.zip,
		startDate: startDateRef.current?.value ?? data.getArtist.startDate,
		instagram: instagramRef.current?.value ?? data.getArtist.instagram,
		facebook: facebookRef.current?.value ?? data.getArtist.facebook,
		// shopId is deliberately NOT sent - see updateArtist's own comment in
		// server/graphql/mutations/artists.js on why an ordinary profile save must not be how an
		// artist's shop changes (that's connectArtistToShop, which asks first).
	});

	const handleIdentityFieldBlur = async () => {
		const payload = buildIdentityPayload();
		const serialized = JSON.stringify(payload);
		if (serialized === lastSavedIdentityRef.current) {
			return;
		}
		lastSavedIdentityRef.current = serialized;
		setIdentitySaveState("saving");
		try {
			await updateArtist({ variables: { artist: payload } });
			setIdentitySaveState("saved");
			// updateArtist now writes the same firstName/lastName through to this person's User row
			// too (see the server mutation's own comment on why), so the change is permanent - but
			// the AuthContext `user` this tab already has in memory was read once at login and has
			// no reason to notice a database write it wasn't told about. Only relevant when the
			// person editing IS the artist being edited: a shop admin renaming someone else has no
			// reason to touch their own cached identity, and doesn't have that artist's session to
			// update anyway. updateCurrentUser (not setSession) is deliberate - see its own comment
			// in context/auth.jsx: this is the same person, re-read, not a new session.
			if (isSelf) {
				updateCurrentUser({
					...user,
					firstName: payload.firstName,
					lastName: payload.lastName,
				});
			}
		} catch (err) {
			lastSavedIdentityRef.current = null;
			setIdentitySaveState("error");
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: `Couldn't save: ${err.graphQLErrors?.[0]?.message || err.message}`,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	if (loading) {
		return <IBPageLoader />;
	}

	if (data && data.getArtist) {
		const artist = data.getArtist;
		return (
			<div className="artist">
				<div className="artistHeader">
					<IBAvatar
						size={80}
						imgUrl={artist.avatar}
						label={`${artist.firstName} ${artist.lastName}`}
					/>
					<div className="artistHeaderInfo">
						<h1 className="artistTitle">
							{`${artist.firstName} ${artist.lastName}`}
						</h1>
						<div className="artistHeaderMeta">
							{artist.title && <span>{artist.title}</span>}
							{artist.email && <span>{artist.email}</span>}
							{artist.phone && <span>{artist.phone}</span>}
						</div>
					</div>
					{/* Archiving is how someone leaves the roster - there is no delete. See
					    components/archive/ArchiveControl.jsx. */}
					<ArchiveControl
						kind="artist"
						name={`${artist.firstName} ${artist.lastName}`}
						isArchived={artist.status === ARTIST_STATUS.ARCHIVED}
						archiveMutation={ArtistService.ARCHIVE_ARTIST_MUTATION}
						unarchiveMutation={ArtistService.UNARCHIVE_ARTIST_MUTATION}
						variables={{ artistId: artist.id }}
						onChanged={refetch}
					/>
				</div>
				<IBCardWrapper>
					<div className="artistIdentityHeader">
						<h1>Details</h1>
						<span
							className={`artistIdentitySaveState artistIdentitySaveState--${identitySaveState}`}
						>
							{identitySaveState === "saving" && "Saving..."}
							{identitySaveState === "saved" && "All changes saved"}
							{identitySaveState === "error" && "Couldn't save - try again"}
						</span>
					</div>
					{!canEditIdentity && (
						<p className="artistIdentityHint">
							Only {artist.firstName || "this artist"} or a shop admin can edit these
							details.
						</p>
					)}
					<div className="ibFieldGroup">
						<div className="ibFieldRow">
							<FormField id="artistFirstName" label="First Name">
								<IBInput
									id="artistFirstName"
									inputRef={firstNameRef}
									defaultValue={artist.firstName}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="artistLastName" label="Last Name">
								<IBInput
									id="artistLastName"
									inputRef={lastNameRef}
									defaultValue={artist.lastName}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="artistEmail" label="Email">
								<IBInput
									id="artistEmail"
									type="email"
									inputRef={emailRef}
									defaultValue={artist.email}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="artistPhone" label="Phone">
								<IBInput
									id="artistPhone"
									type="tel"
									inputRef={phoneRef}
									defaultValue={artist.phone}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="artistTitle" label="Title">
								<IBInput
									id="artistTitle"
									inputRef={titleRef}
									defaultValue={artist.title}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="artistStartDate" label="Start Date">
								<IBInput
									id="artistStartDate"
									type="date"
									inputRef={startDateRef}
									defaultValue={artist.startDate}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="artistAddress" label="Address">
								<IBInput
									id="artistAddress"
									inputRef={addressRef}
									defaultValue={artist.address}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="artistCity" label="City">
								<IBInput
									id="artistCity"
									inputRef={cityRef}
									defaultValue={artist.city}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="artistState" label="State">
								<IBInput
									id="artistState"
									inputRef={stateRef}
									defaultValue={artist.state}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="artistZip" label="Zip">
								<IBInput
									id="artistZip"
									inputRef={zipRef}
									defaultValue={artist.zip}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="artistInstagram" label="Instagram">
								<IBInput
									id="artistInstagram"
									inputRef={instagramRef}
									defaultValue={artist.instagram}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="artistFacebook" label="Facebook">
								<IBInput
									id="artistFacebook"
									inputRef={facebookRef}
									defaultValue={artist.facebook}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
					</div>
				</IBCardWrapper>
				{/* Above the performance figures, because the rate is the term those figures are
				    computed under - reading revenue without knowing the split is reading half of it.
				    canEdit is the SHOP ADMIN check; an artist viewing their own page sees the history
				    with no form, which is the asymmetry the server enforces (a party cannot set the
				    number they owe). Renders nothing at all for an artist with no shop. */}
				<ShopCutRatePanel
					artistUserId={artist.userId}
					shopId={artist.shopId}
					canEdit={user.role <= ROLES.SHOP_ADMIN && String(user.id) !== String(artist.userId)}
				/>
				<ArtistPerformancePanel artistUserId={artist.userId} isSelf={false} />
			</div>
		);
	} else {
		return <div>This artist does not exist</div>;
	}
};
export default Artist;
