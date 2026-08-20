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
import IBImageTagEditor from "./IBImageTagEditor";

// This used to append `?w=&h=&fit=crop&auto=format&dpr=2x` to every image URL - lifted straight
// from MUI's own ImageList demo, which points at Unsplash (an image CDN that actually supports
// those dynamic resize query params). image.url here is always a real Firebase Storage download
// URL (see IBUploadFileWithProgress.js), which already ends in its own `?alt=media&token=...`
// query string and doesn't support resize params at all. Appending a second `?w=...` produced a
// malformed URL with two `?`s - Firebase parses everything after the first `&token=` as part of
// the token itself, so the token gets corrupted and the image request 400s. Every uploaded image
// was silently failing to load because of this, not just the newest one - found via manual
// testing the instant an upload actually made it into the referenceImages array for the first time
// this session. Fixed by just using the real URL as-is; sizing is already handled by the
// surrounding ImageListItem/CSS, not a CDN query param.
function srcset(image) {
	return {
		src: image,
		srcSet: image,
	};
}

const IBImagesList = ({
	imageData,
	updateCallback,
	imageType,
	onTagsUpdate,
	// The three below are optional passthroughs to IBImagesListOptions, all undefined by default
	// so every EXISTING caller (Project.jsx's References/Design/Body lists) keeps its current
	// behavior unchanged - only a caller that supplies them (the client-dashboard shared-images
	// panel) gets the different delete semantics/extra menu item. See IBImagesListOptions.jsx's
	// own comments on why the shared-images context needs a non-destructive delete.
	onDelete,
	deleteLabel,
	extraActions,
	// Optional per-image overlay, rendered above the existing "x time ago" pill - e.g. the
	// shared-images panel's "Added to References" badge once an image has been filed onto a
	// project. Returns a node (or a falsy value to render nothing for that image).
	renderBadge,
}) => {
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
							onDelete={onDelete}
							deleteLabel={deleteLabel}
							extraActions={extraActions}
						/>
						{renderBadge && renderBadge(item) && (
							<Typography
								variant="body2"
								component="span"
								sx={{
									position: "absolute",
									bottom: 22,
									left: 0,
									color: "white",
									background: "rgba(0,0,0, .3)",
									p: "5px",
									fontSize: "11px",
									borderTopRightRadius: 8,
								}}
							>
								{renderBadge(item)}
							</Typography>
						)}
						{onTagsUpdate && (
							<IBImageTagEditor
								img={item}
								onTagsUpdate={(img, newTags) =>
									onTagsUpdate(img, newTags, imageType)
								}
							/>
						)}
						<img
							{...srcset(item.url)}
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
								// imgProps was removed from MUI's Avatar API (replaced by
								// slotProps.img) as of the React 17->19/MUI 5->9 upgrade earlier
								// this project - this one call site was missed at the time. MUI
								// silently let the unrecognized prop fall through to the DOM,
								// which is what threw the "React does not recognize the
								// `imgProps` prop" console warning - found via manual testing.
								slotProps={{ img: { "aria-hidden": true } }}
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
