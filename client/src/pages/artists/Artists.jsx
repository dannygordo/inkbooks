import React from "react";
import "./artists.css";
import { CircularProgress } from "@mui/material";
import IBCard from "../../components/card/ibCard/IBCard";
import IBPageActionBar from "../../components/ibPageActionBar/IBPageActionBar";
import { ArtistService } from "../../services/ArtistService";
import { APP_SETTINGS_CONSTANTS } from "../../constants";

const Artists = () => {
	const { loading, data } = ArtistService.fetchArtists();
	if (loading)
		return (
			<CircularProgress>
				{APP_SETTINGS_CONSTANTS.LOADING_TEXT}
			</CircularProgress>
		);
	return (
		<div className="artists">
			<IBPageActionBar
				pageType={APP_SETTINGS_CONSTANTS.PAGE_TYPES.ARTISTS}
			/>
			<div className="artistsContainer">
				{data.getArtists.map((user) => {
					return (
						<IBCard
							cardData={user}
							key={user.id}
							cardType={APP_SETTINGS_CONSTANTS.CARD_TYPES.ARTIST}
						/>
					);
				})}
			</div>
		</div>
	);
};
export default Artists;
