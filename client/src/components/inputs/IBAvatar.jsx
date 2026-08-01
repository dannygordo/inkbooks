import * as React from "react";
import { styled } from "@mui/material/styles";
import Badge from "@mui/material/Badge";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";

const StyledBadge = styled(Badge)(({ theme }) => ({
	"& .MuiBadge-badge": {
		backgroundColor: "#44b700",
		color: "#44b700",
		boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
		"&::after": {
			position: "absolute",
			top: 0,
			left: 0,
			width: "100%",
			height: "100%",
			borderRadius: "50%",
			animation: "ripple 1.2s infinite ease-in-out",
			border: "1px solid currentColor",
			content: '""',
		},
	},
	"@keyframes ripple": {
		"0%": {
			transform: "scale(.8)",
			opacity: 1,
		},
		"100%": {
			transform: "scale(2.4)",
			opacity: 0,
		},
	},
}));

const IBAvatar = ({ imgUrl, isOnline = false, size, label, cursor = "" }) => {
	if (isOnline) {
		return (
			<Stack direction="row" spacing={2}>
				<StyledBadge
					overlap="circular"
					anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
					variant="dot"
				>
					<Avatar
						alt={label}
						src={imgUrl}
						sx={{ width: { size }, height: { size } }}
					/>
				</StyledBadge>
			</Stack>
		);
	} else {
		return (
			<Avatar
				alt={label}
				src={imgUrl}
				sx={{ width: size, height: size, cursor: cursor }}
			/>
		);
	}
};

export default IBAvatar;
