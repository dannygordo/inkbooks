import { useParams, useNavigate } from "react-router-dom";
import "./artist.css";
import { ArtistService } from "../../services/ArtistService";
import { ROUTE_CONSTANTS } from "../../constants";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBChatBox from "../../components/ibChatBox/IBChatBox";

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

	if (data) {
		return (
			<div className="artist">
				<h1 className="artistTitle">
					{`${data.getArtist.firstName} ${data.getArtist.lastName}`}
				</h1>
				<div>
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
			</div>
		);
	} else {
		return <div>This artist does not exist</div>;
	}
};
export default Artist;
