import * as React from "react";
import { useState } from "react";
import { Box, Chip, ClickAwayListener, IconButton, TextField } from "@mui/material";
import { LocalOffer } from "@mui/icons-material";

// Per-image tagging - groundwork for search, not search itself (the tags just get stored on
// IBImage.tags for now, see server/graphql/typeDefs.js). Lives as its own small overlay component
// rather than folding into IBImagesListOptions.jsx's menu, since "type a tag and hit enter" needs
// its own open/text state per image and doesn't fit a MenuItem.
const IBImageTagEditor = ({ img, onTagsUpdate }) => {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const tags = img.tags || [];

	const closeInput = () => {
		setOpen(false);
		setValue("");
	};

	const handleAdd = (e) => {
		e.preventDefault();
		const tag = value.trim();
		if (!tag) {
			closeInput();
			return;
		}
		if (!tags.includes(tag)) {
			onTagsUpdate(img, [...tags, tag]);
		}
		setValue("");
	};

	const handleDelete = (tagToDelete) => {
		onTagsUpdate(
			img,
			tags.filter((tag) => tag !== tagToDelete)
		);
	};

	return (
		// Stops a click here from also opening the lightbox behind it (see IBImagesList.jsx's
		// onClick={() => setLightboxIndex(index)} on the <img> beneath this overlay).
		<Box
			onClick={(e) => e.stopPropagation()}
			sx={{
				position: "absolute",
				left: 0,
				top: 0,
				right: 32,
				display: "flex",
				flexWrap: "wrap",
				gap: "3px",
				alignItems: "center",
				p: "3px",
			}}
		>
			{tags.map((tag) => (
				<Chip
					key={tag}
					label={tag}
					size="small"
					onDelete={() => handleDelete(tag)}
					sx={{
						height: 20,
						fontSize: "11px",
						background: "rgba(0,0,0,.55)",
						color: "white",
						"& .MuiChip-deleteIcon": { color: "rgba(255,255,255,.7)" },
					}}
				/>
			))}
			{open ? (
				<ClickAwayListener onClickAway={closeInput}>
					<form onSubmit={handleAdd}>
						<TextField
							size="small"
							variant="outlined"
							autoFocus
							placeholder="Add tag"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape") closeInput();
							}}
							sx={{
								width: 92,
								background: "white",
								borderRadius: "4px",
								"& .MuiInputBase-input": {
									fontSize: "11px",
									padding: "2px 6px",
								},
							}}
						/>
					</form>
				</ClickAwayListener>
			) : (
				<IconButton
					size="small"
					onClick={() => setOpen(true)}
					sx={{
						color: "white",
						background: "rgba(0,0,0,.4)",
						width: 22,
						height: 22,
						"&:hover": { background: "rgba(0,0,0,.6)" },
					}}
				>
					<LocalOffer sx={{ fontSize: 13 }} />
				</IconButton>
			)}
		</Box>
	);
};

export default IBImageTagEditor;
