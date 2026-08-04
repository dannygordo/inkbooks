import React from "react";
import "./artists.css";
import EntityList from "../../components/entityList/EntityList";
import IBPageActionBar from "../../components/ibPageActionBar/IBPageActionBar";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import { ArtistService } from "../../services/ArtistService";
import { APP_SETTINGS_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import UtilsService from "../../services/UtilsService";

// Was a grid of IBCard tiles. Now the same list the dashboard uses - see
// components/entityList/EntityList.jsx for why a directory wants rows rather than cards.
//
// Every field the card showed is still here: avatar and name from IBCardHeader, then email,
// phone, Instagram and Facebook from IBCardArtistDetails. `title` moves to the secondary line,
// which is where the card had it too.
const Artists = () => {
	const { loading, data } = ArtistService.fetchArtists();
	if (loading) {
		return <IBPageLoader />;
	}

	const items = (data?.getArtists || []).map((artist) => ({
		key: artist.id,
		// The Artist DOCUMENT's id - /artist/:artistId routes on that, not the User id. Same trap
		// the analytics table and RoleRoute both had to be corrected for.
		linkTo: `${ROUTE_CONSTANTS.ARTIST}${artist.id}`,
		// user.avatar first, matching what the card header read: the Artist copy is a stale
		// duplicate only ever written at creation (see the Artist.avatar resolver's own comment).
		avatar: artist.user?.avatar || artist.avatar,
		primary: `${artist.firstName} ${artist.lastName}`,
		secondary: artist.title,
		meta: [
			{ label: "Email", value: artist.email },
			{ label: "Phone", value: UtilsService.formatPhone(artist.phone) },
			{ label: "Instagram", value: artist.instagram },
			{ label: "Facebook", value: artist.facebook },
		],
	}));

	return (
		<div className="artists">
			<IBPageActionBar
				pageType={APP_SETTINGS_CONSTANTS.PAGE_TYPES.ARTISTS}
			/>
			<EntityList items={items} emptyMessage="No artists at this shop yet." />
		</div>
	);
};
export default Artists;
