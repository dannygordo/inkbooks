import { Close } from "@mui/icons-material";
import { Dialog, DialogTitle, IconButton } from "@mui/material";
import React, { useContext, useEffect } from "react";
import { AuthContext } from "../../context/auth";
import IBAlert from "../ibAlert/IBAlert";
import { ALERT_CONSTANTS } from "../../constants";

const IBModal = () => {
	const {
		user,
		modal,
		setModal,
		alert: { location, isAlert, setAlert },
	} = useContext(AuthContext);

	const handleClose = () => {
		setModal({ ...modal, isOpen: false });
	};
	useEffect(() => {
		if (modal.isOpen === false) {
			if (isAlert && location === ALERT_CONSTANTS.DISPLAY_MODAL) {
				setAlert({ ...alert, isAlert: false });
			}
		}
	}, [modal?.isOpen]);
	return (
		<Dialog open={modal.isOpen} onClose={handleClose} >
			<DialogTitle>
				{modal.title}
				<IconButton
					aria-label="Close"
					onClick={handleClose}
					sx={{
						position: "absolute",
						top: 8,
						right: 8,
						color: (theme) => theme.palette.grey[500],
					}}
				>
					<Close />
				</IconButton>
			</DialogTitle>
			{location === ALERT_CONSTANTS.DISPLAY_MODAL && <IBAlert />}
			{modal.content}
		</Dialog>
	);
};

export default IBModal;
