import { useParams } from "react-router-dom";
import "./artist.css";
import { ArtistService } from "../../services/ArtistService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBAvatar from "../../components/inputs/IBAvatar";
import ArtistPerformancePanel from "../../components/artistDashboard/ArtistPerformancePanel";
import ShopCutRatePanel from "../../components/artistDashboard/ShopCutRatePanel";
import { useAuth } from "../../context/auth";
import { ROLES } from "../../constants";
import ArchiveControl from "../../components/archive/ArchiveControl";
import { ARTIST_STATUS } from "../../constants";

// Was a name and an "Edit Artist" button with nothing else - this is the shop's management view
// into one specific artist (as opposed to Home.jsx, which is an artist's view of their own
// numbers) - see PRODUCTION_ROADMAP.md for why the same ArtistPerformancePanel is mounted in both
// places with different framing rather than built twice.
const Artist = (props) => {
	let params = useParams();
	// The VIEWER, not the artist being viewed - the two are the same person when an artist opens
	// their own page, which is exactly the case the rate panel has to tell apart.
	const { user } = useAuth();
	/**
	 * Gets artist by id
	 */
	const { loading, data, refetch } = ArtistService.fetchArtist(params.artistId);

	// The corner "Edit" button is gone from every detail page. It was a fixed action in the top
	// right of a record that didn't say what it edited or where it went, and it was the only way
	// in - so viewing and editing were two separate destinations for the same record, with a
	// round trip between them. Rows now lead straight to the record, and editing belongs beside
	// the thing being edited rather than in a corner. The edit ROUTES are untouched and still
	// reachable directly; only the corner button is removed.

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
