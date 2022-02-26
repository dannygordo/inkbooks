import React from "react";
import { useAuth } from "../../context/auth";
import IBAlert from "./IBAlert";
import { ALERT_CONSTANTS } from "../../constants";

const IBDisplayPageAlert = () => {
	const {
		alert: { location },
	} = useAuth();
	return location === ALERT_CONSTANTS.DISPLAY_MAIN_PAGE && <IBAlert />;
};

export default IBDisplayPageAlert;
