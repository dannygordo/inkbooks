import * as React from "react";
import { useState } from "react";
import { Box, Chip, IconButton, Popover, TextField } from "@mui/material";
import { LocalOffer } from "@mui/icons-material";

// Per-image tagging - groundwork for search, not search itself (the tags just get stored on
// IBImage.tags for now, see server/graphql/typeDefs.js). Lives as its own small overlay component
// rather than folding into IBImagesListOptions.jsx's menu, since "type a tag and hit enter" needs
// its own open/text state per image and doesn't fit a MenuItem.
//
// The "add tag" input is a Popover, not an inline field squeezed into this overlay's own box.
// This overlay's width is `right: 32` inside whatever the grid gave this image - on the smaller
// 1x1 tiles (IBImagesList.jsx's imageLayoutPattern, rowHeight 121) that leaves under 90px, nowhere
// near enough for a usable text input next to any existing tag chips. No amount of padding fixes
// an input that's wider than the box it's forced into - it has to stop being sized off the image's
// own pixel width. A Popover renders in a portal (MUI's Modal, mounted at document.body), so its
// content is laid out with real breathing room regardless of how small the thumbnail underneath
// it is, and - as a side effect - can no longer inherit color/background from this dark
// image-overlay's own styling the way an inline field sitting in the same DOM branch could.
const IBImageTagEditor = ({ img, onTagsUpdate }) => {
	const [anchorEl, setAnchorEl] = useState(null);
	const [value, setValue] = useState("");
	const tags = img.tags || [];
	const open = Boolean(anchorEl);

	const closeInput = () => {
		setAnchorEl(null);
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
				gap: "8px",
				alignItems: "center",
				p: "8px",
			}}
		>
			{tags.map((tag) => (
				<Chip
					key={tag}
					label={tag}
					size="small"
					onDelete={() => handleDelete(tag)}
					sx={{
						height: 26,
						fontSize: "12px",
						fontWeight: 500,
						background: "rgba(0,0,0,.6)",
						color: "white",
						boxShadow: "0 1px 3px rgba(0,0,0,.35)",
						"& .MuiChip-label": { px: "8px" },
						"& .MuiChip-deleteIcon": { color: "rgba(255,255,255,.75)" },
					}}
				/>
			))}
			<IconButton
				size="small"
				onClick={(e) => setAnchorEl(e.currentTarget)}
				sx={{
					color: "white",
					background: "rgba(0,0,0,.45)",
					width: 26,
					height: 26,
					boxShadow: "0 1px 3px rgba(0,0,0,.35)",
					"&:hover": { background: "rgba(0,0,0,.65)" },
				}}
			>
				<LocalOffer sx={{ fontSize: 14 }} />
			</IconButton>
			<Popover
				open={open}
				anchorEl={anchorEl}
				onClose={closeInput}
				anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
				transformOrigin={{ vertical: "top", horizontal: "left" }}
				onClick={(e) => e.stopPropagation()}
				slotProps={{ paper: { sx: { mt: "6px" } } }}
			>
				{/* No bgcolor/color overrides here on purpose - MUI's Popover already renders its
				    content inside a themed Paper (background.paper, text.primary set by
				    theme/theme.js for whichever mode is active), which is exactly the contrast this
				    is after. Setting anything here would just be re-fighting a fight the Paper
				    already wins. */}
				<Box
					component="form"
					onSubmit={handleAdd}
					sx={{ display: "flex", alignItems: "center", gap: "8px", p: "12px", minWidth: 220 }}
				>
					<TextField
						size="small"
						variant="outlined"
						autoFocus
						fullWidth
						label="Add tag"
						placeholder="e.g. cover-up"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") closeInput();
						}}
					/>
				</Box>
			</Popover>
		</Box>
	);
};

export default IBImageTagEditor;
