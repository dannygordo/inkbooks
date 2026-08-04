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
// Widths are fixed rather than fractional so the header and every row resolve to the same grid -
// see EntityList's own comment on why 1fr columns would drift apart.
const ARTIST_COLUMNS = [
	{ key: "email", label: "Email", width: "220px" },
	{ key: "phone", label: "Phone", width: "140px" },
	{ key: "instagram", label: "Instagram", width: "150px" },
	{ key: "facebook", label: "Facebook", width: "150px" },
];

const Artists = () => {
	// refetch is handed to the action bar so a newly created artist appears immediately - the
	// create mutation has no way to know this list query exists, let alone update its cache.
	const { loading, data, refetch } = ArtistService.fetchArtists();
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
		values: {
			email: artist.email,
			phone: UtilsService.formatPhone(artist.phone),
			instagram: artist.instagram,
			facebook: artist.facebook,
		},
	}));

	return (
		<div className="artists">
			<IBPageActionBar
				pageType={APP_SETTINGS_CONSTANTS.PAGE_TYPES.ARTISTS}
				onCreated={refetch}
			/>
			<EntityList
				columns={ARTIST_COLUMNS}
				items={items}
				emptyMessage="No artists at this shop yet."
			/>
		</div>
	);
};
export default Artists;
