import * as React from "react";
import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Tooltip from "@mui/material/Tooltip";
import { IconButton } from "@mui/material";
import { Delete, MoreVert } from "@mui/icons-material";
import IBDeleteFile from "../../firebase/IBDeleteFile";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS, AUTH_SETTINGS_CONSTANTS } from "../../constants";

const IBImagesListOptions = ({
	img,
	updateCallback,
	imageType,
	// Overrides the delete action entirely when provided. The default behavior below
	// (IBDeleteFile + updateCallback) permanently deletes the underlying Firebase Storage file -
	// correct for a project's own image lists, where that file exists ONLY for the project, but
	// wrong for the client-dashboard shared-images panel: that same URL is also the image
	// actually shown in the client's chat history (IBMessage.jsx), and deleting the file would
	// break it there too, silently, for a conversation nobody was trying to edit. Callers in that
	// context pass their own onDelete (e.g. removeSharedImageFromList - see
	// SharedImagesPanel.jsx) which drops the row from THIS list only.
	onDelete,
	deleteLabel = "Delete",
	// Extra menu items rendered above Delete, e.g. the shared-images panel's "Assign to Project" -
	// [{ label, icon, onClick(img) }]. Empty by default so every existing caller's menu is
	// unchanged.
	extraActions = [],
}) => {
	const { setAlert } = useAuth();
	const [anchorEl, setAnchorEl] = React.useState(null);
	const open = Boolean(anchorEl);
	const handleClick = (event) => {
		setAnchorEl(event.currentTarget);
	};
	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleDelete = async () => {
		if (onDelete) {
			try {
				await onDelete(img);
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
					message:
						AUTH_SETTINGS_CONSTANTS.RESPONSE_MESSAGES
							.RECORD_UPDATE_SUCCESS,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			} catch (error) {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: error.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			}
			return;
		}
		try {
			await IBDeleteFile(img.url);
		} catch (error) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: error.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE
			});
			console.log(error);
		}
		try {
			updateCallback(img, imageType);
		}catch(error) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: error.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE
			});
		}
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message:
				AUTH_SETTINGS_CONSTANTS.RESPONSE_MESSAGES
					.RECORD_UPDATE_SUCCESS,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};
	return (
		<React.Fragment>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					textAlign: "center",
				}}
			>
				<Tooltip title="Options">
					<IconButton
						onClick={handleClick}
						sx={{
							position: "absolute",
							right: 0,
							top: 0,
							color: "white",
							background: "rgba(0,0,0,.3)",
						}}
					>
						<MoreVert fontSize="large" />
					</IconButton>
				</Tooltip>
			</Box>
			<Menu
				anchorEl={anchorEl}
				open={open}
				onClose={handleClose}
				onClick={handleClose}
				PaperProps={{
					elevation: 0,
					sx: {
						overflow: "visible",
						filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.32))",
						mt: 1.5,
						"& .MuiAvatar-root": {
							width: 32,
							height: 32,
							ml: -0.5,
							mr: 1,
						},
						"&:before": {
							content: '""',
							display: "block",
							position: "absolute",
							top: 0,
							right: 14,
							width: 10,
							height: 10,
							bgcolor: "background.paper",
							transform: "translateY(-50%) rotate(45deg)",
							zIndex: 0,
						},
					},
				}}
				transformOrigin={{ horizontal: "right", vertical: "top" }}
				anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
			>
				{extraActions.map((action) => (
					<MenuItem key={action.label} onClick={() => action.onClick(img)}>
						<ListItemIcon>{action.icon}</ListItemIcon>
						{action.label}
					</MenuItem>
				))}
				<MenuItem onClick={handleDelete}>
					<ListItemIcon>
						<Delete />
					</ListItemIcon>
					{deleteLabel}
				</MenuItem>
			</Menu>
		</React.Fragment>
	);
};
export default IBImagesListOptions;
