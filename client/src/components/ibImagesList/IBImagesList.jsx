import * as React from "react";
import { useState } from "react";
import ImageList from "@mui/material/ImageList";
import ImageListItem from "@mui/material/ImageListItem";
// simple-react-lightbox was replaced - it pinned its peer dependency to React 17.0.2 exactly
// (never updated past version 3.6.9-0, effectively abandoned) and forcing it to install
// alongside React 18/19 also pulled in a critical vulnerability from its own old dependencies
// (framer-motion/nano-css). yet-another-react-lightbox is actively maintained and has no React
// version pin. Its API is a real architectural difference, not a drop-in swap: SRLWrapper
// declaratively scanned the DOM for <img> tags inside it and built the lightbox automatically;
// yet-another-react-lightbox instead needs an explicit slides array plus controlled
// open/index state, with each thumbnail's onClick setting that index - see below.
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { Avatar, Tooltip, Typography } from "@mui/material";
import moment from "moment";
import { APP_SETTINGS_CONSTANTS } from "../../constants";
import IBImagesListOptions from "./IBImagesListOptions";

function srcset(image, size, rows = 1, cols = 1) {
	return {
		src: `${image}?w=${size * cols}&h=${size * rows}&fit=crop&auto=format`,
		srcSet: `${image}?w=${size * cols}&h=${
			size * rows
		}&fit=crop&auto=format&dpr=2 2x`,
	};
}

const IBImagesList = ({ imageData, updateCallback, imageType }) => {
	// -1 means closed - yet-another-react-lightbox's own convention (index is which slide to
	// open on, not just a boolean), reused here rather than a separate open/close flag.
	const [lightboxIndex, setLightboxIndex] = useState(-1);

	return (
		<React.Fragment>
			<ImageList
				sx={{ height: 275 }}
				variant="quilted"
				cols={4}
				rowHeight={121}
			>
				{imageData.map((item, index) => (
					<ImageListItem
						key={item.url}
						cols={
							imageLayoutPattern[
								index -
									Math.floor(
										index / imageLayoutPattern.length
									) *
										imageLayoutPattern.length
							].cols
						}
						rows={
							imageLayoutPattern[
								index -
									Math.floor(
										index / imageLayoutPattern.length
									) *
										imageLayoutPattern.length
							].rows
						}
						sx={{
							opacity: ".7",
							transition: "opacity .3s linear",
							cursor: "pointer",
							"&:hover": { opacity: 1 },
						}}
					>
						<IBImagesListOptions
							img={item}
							updateCallback={updateCallback}
                            imageType={imageType}
						/>
						<img
							{...srcset(
								item.url,
								121,
								imageLayoutPattern[
									index -
										Math.floor(
											index / imageLayoutPattern.length
										) *
											imageLayoutPattern.length
								].rows,
								imageLayoutPattern[
									index -
										Math.floor(
											index / imageLayoutPattern.length
										) *
											imageLayoutPattern.length
								].cols
							)}
							alt={item.title}
							loading="lazy"
							onClick={() => setLightboxIndex(index)}
						/>
						<Typography
							variant="body2"
							component="span"
							sx={{
								position: "absolute",
								bottom: 0,
								left: 0,
								color: "white",
								background: "rgba(0,0,0, .3)",
								p: "5px",
								borderTopRightRadius: 8,
							}}
						>
							{moment(item.createdAt).fromNow()}
						</Typography>
						<Tooltip
							title={
								item.userInfo
									? `${item.userInfo.firstName} ${item.userInfo.lastName}`
									: "Unknown uploader"
							}
							sx={{
								position: "absolute",
								bottom: "3px",
								right: "3px",
							}}
						>
							<Avatar
								src={
									(item.userInfo && item.userInfo.avatar) ||
									APP_SETTINGS_CONSTANTS.NO_IMAGE_URL
								}
								imgProps={{ "aria-hidden": true }}
							/>
						</Tooltip>
					</ImageListItem>
				))}
			</ImageList>
			<Lightbox
				open={lightboxIndex >= 0}
				close={() => setLightboxIndex(-1)}
				index={lightboxIndex}
				slides={imageData.map((item) => ({
					src: item.url,
					alt: item.title,
				}))}
			/>
		</React.Fragment>
	);
};


const imageLayoutPattern = [
	{
		rows: 2,
		cols: 2,
	},
	{
		rows: 1,
		cols: 1,
	},
	{
		rows: 1,
		cols: 1,
	},
	{
		rows: 1,
		cols: 2,
	},
	{
		rows: 1,
		cols: 2,
	},
	{
		rows: 2,
		cols: 2,
	},
	{
		rows: 1,
		cols: 1,
	},
	{
		rows: 1,
		cols: 1,
	},
];
export default IBImagesList;
