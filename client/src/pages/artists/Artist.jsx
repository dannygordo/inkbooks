import { useParams, useNavigate } from "react-router-dom";
import "./artist.css";
import { ArtistService } from "../../services/ArtistService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBAvatar from "../../components/inputs/IBAvatar";
import ArtistPerformancePanel from "../../components/artistDashboard/ArtistPerformancePanel";

// Was a name and an "Edit Artist" button with nothing else - this is the shop's management view
// into one specific artist (as opposed to Home.jsx, which is an artist's view of their own
// numbers) - see PRODUCTION_ROADMAP.md for why the same ArtistPerformancePanel is mounted in both
// places with different framing rather than built twice.
const Artist = (props) => {
	const navigate = useNavigate();
	let params = useParams();
	/**
	 * Gets artist by id
	 */
	const { loading, data } = ArtistService.fetchArtist(params.artistId);

	/**
	 * Handles the edit click event
	 */
	const handleEdit = (e) => {
		e.preventDefault();
		navigate(`${ROUTE_CONSTANTS.EDIT_ARTIST}${params.artistId}`);
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
					<div className="artistActions">
						<div className="artistActionItem">
							<button
								onClick={handleEdit}
								className="artistButton"
								disabled={params.artistId && false}
							>
								Edit Artist
							</button>
						</div>
					</div>
				</div>
				<ArtistPerformancePanel artistUserId={artist.userId} isSelf={false} />
			</div>
		);
	} else {
		return <div>This artist does not exist</div>;
	}
};
export default Artist;
