import * as React from "react";
import ImageList from "@mui/material/ImageList";
import ImageListItem from "@mui/material/ImageListItem";
import { SRLWrapper } from "simple-react-lightbox";
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
	return (
		<SRLWrapper>
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
							title={`${item.userInfo.firstName} ${item.userInfo.lastName}`}
							sx={{
								position: "absolute",
								bottom: "3px",
								right: "3px",
							}}
						>
							<Avatar
								src={
									item.userInfo.avatar ||
									APP_SETTINGS_CONSTANTS.NO_IMAGE_URL
								}
								imgProps={{ "aria-hidden": true }}
							/>
						</Tooltip>
					</ImageListItem>
				))}
			</ImageList>
		</SRLWrapper>
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
