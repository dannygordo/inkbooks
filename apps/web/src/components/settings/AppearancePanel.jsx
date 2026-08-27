// Explicit React import - see scripts/check-react-in-tested-components.mjs.
import React from "react";
import { useMutation } from "@apollo/client";
import { MenuItem, TextField } from "@mui/material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import UserService from "../../services/UserService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";

const OPTIONS = [
	{ value: "system", label: "Match device" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

/**
 * Light / dark / match-device, saved to the account (User.themePreference) rather than to this
 * browser - see ThemeModeProvider.jsx's own comment on why that's deliberate. Picking an option
 * here flips the whole app immediately, before the save round-trip finishes: updateCurrentUser
 * writes the new preference into AuthContext synchronously, and ThemeModeProvider's ModeSync
 * effect is watching user.themePreference, so the mode change is the same render pass a real
 * MUI-driven toggle would produce - the mutation underneath is just what makes it stick past a
 * refresh or a different device.
 */
const AppearancePanel = () => {
	const { user, updateCurrentUser, setAlert } = useAuth();
	const [updateUser, { loading: saving }] = useMutation(
		UserService.UPDATE_USER_MUTATION
	);

	const preference = user.themePreference || "system";

	const handleChange = async (e) => {
		const themePreference = e.target.value;
		try {
			const { data } = await updateUser({
				variables: {
					user: {
						id: user.id,
						email: user.email,
						role: user.role,
						themePreference,
					},
				},
			});
			updateCurrentUser({ ...user, themePreference: data.updateUser.themePreference });
		} catch (error) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: error.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	return (
		<IBCardWrapper>
			<h1>Appearance</h1>
			<p className="settingsPanelHelp">
				Applies to your account, not just this browser - it follows you to whatever device
				you sign into next.
			</p>
			<TextField
				select
				size="small"
				label="Theme"
				value={preference}
				onChange={handleChange}
				disabled={saving}
				sx={{ minWidth: 220 }}
			>
				{OPTIONS.map((opt) => (
					<MenuItem key={opt.value} value={opt.value}>
						{opt.label}
					</MenuItem>
				))}
			</TextField>
		</IBCardWrapper>
	);
};

export default AppearancePanel;
