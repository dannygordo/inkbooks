import { Close } from "@mui/icons-material";
import { Alert, Box, Collapse, IconButton, Slide } from "@mui/material";
import { useEffect, useRef } from "react";
import { useAuth } from "../../context/auth";

const IBAlert = () => {
	const alertRef = useRef();

	const {
		alert: { isAlert, severity, message, timeout },
		setAlert,
	} = useAuth();

	useEffect(() => {
		alertRef.current.scrollIntoView({
			behavior: "smooth",
			block: "end",
			inline: "nearest",
		});

		let timer;
		if (timeout) {
			timer = setTimeout(() => {
				setAlert({ ...alert, isAlert: false });
			}, timeout);
		}

		//clear the timeout
		return () => clearTimeout(timer);
	}, [timeout]);
	return (
		<Box sx={{ mb: 2, position: 'absolute', zIndex: 99999, width: '100%', textAlign: 'center' }} ref={alertRef}>
			<Slide direction="down" in={isAlert} container={alertRef.current}>
				<Alert
					severity={severity}
					action={
						<IconButton
							aria-label="Close"
							size="small"
							onClick={() =>
								setAlert({ ...alert, isAlert: false })
							}
						>
							<Close fontSize="small" />
						</IconButton>
					}
				>
					{message}
				</Alert>
			</Slide>
		</Box>
	);
};

export default IBAlert;
