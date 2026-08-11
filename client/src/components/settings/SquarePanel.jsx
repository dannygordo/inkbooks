import React from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@apollo/client";
import ShopService from "../../services/ShopService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";

// Shown after landing back here from the Square OAuth redirect. The callback for an ARTIST owner
// redirects to /settings?square=<status> (see routes/squareOAuth.js's settingsRedirectUrl), the
// same way the SHOP one redirects to /shop/:shopId - so these mirror Shop.jsx's messages.
const SQUARE_REDIRECT_MESSAGES = {
	connected: { text: "Square account connected.", type: "success" },
	denied: { text: "Square connection was cancelled.", type: "error" },
	error: { text: "Something went wrong connecting Square. Please try again.", type: "error" },
};

/**
 * The artist's own Square connection - the account their CLIENTS pay into.
 *
 * EVERY ARTIST HAS ONE, shop or no shop (DECISIONS.md M9). A client pays the artist for the work;
 * what the artist owes the shop is settled afterwards through the shop-cut ledger, the same way it
 * would be with cash. The shop's own Square account is a different thing entirely - it is what
 * RECEIVES those cut invoices - and it is connected from the shop page, not here.
 *
 * This panel briefly told a shop artist that their shop held the connection and offered them no
 * button. That followed from the server resolving their charges to the shop's account, which was
 * the bug: the shop was paid the whole amount and then invoiced the artist for a cut of it.
 */
const SquarePanel = () => {
	const { loading, data, refetch } = ShopService.fetchMySquareConnection();
	const [getMySquareAuthorizationUrl, { loading: urlLoading }] =
		ShopService.useMySquareAuthorizationUrl();
	const [disconnectMySquare, { loading: disconnecting }] = useMutation(
		ShopService.DISCONNECT_MY_SQUARE
	);
	const [error, setError] = React.useState(null);
	const [searchParams, setSearchParams] = useSearchParams();

	const redirectStatus = searchParams.get("square");
	const redirectMessage = redirectStatus && SQUARE_REDIRECT_MESSAGES[redirectStatus];

	const dismissRedirectBanner = () => {
		searchParams.delete("square");
		setSearchParams(searchParams);
	};

	// Redirects straight to Square's own hosted authorization page - InkBooks never shows its own
	// consent UI for this, Square owns that entire screen. Same as Shop.jsx's handler.
	const handleConnect = async (e) => {
		e.preventDefault();
		setError(null);
		try {
			const res = await getMySquareAuthorizationUrl();
			if (res.data && res.data.getMySquareAuthorizationUrl) {
				window.location.href = res.data.getMySquareAuthorizationUrl;
			}
		} catch (err) {
			setError(err.graphQLErrors?.[0]?.extensions?.errors?.square || err.message);
		}
	};

	const handleDisconnect = async () => {
		// Disconnecting is not destructive here - past appointments, invoices and payments are
		// untouched, and reconnecting is a click. So this confirms rather than warns.
		if (!window.confirm("Disconnect Square? You can reconnect at any time.")) {
			return;
		}
		setError(null);
		try {
			await disconnectMySquare();
			await refetch();
		} catch (err) {
			setError(err.graphQLErrors?.[0]?.extensions?.errors?.square || err.message);
		}
	};

	if (loading || !data) {
		return null;
	}

	const { connected, connectedAt } = data.getMySquareConnection;

	return (
		<IBCardWrapper>
			{redirectMessage && (
				<div
					className={`settingsSquareBanner settingsSquareBanner--${redirectMessage.type}`}
					onClick={dismissRedirectBanner}
				>
					{redirectMessage.text} (click to dismiss)
				</div>
			)}
			<div>
				<h1>Square</h1>
				<p className="settingsPanelHelp">
					Connect Square to take card payments and deposits. Clients pay you directly - if
					you work at a shop, their cut is settled separately, afterwards.
				</p>
			</div>

			{connected ? (
				<div>
					<p className="settingsSquareStatus settingsSquareStatus--connected">Connected</p>
					{connectedAt && (
						<p className="settingsPanelHelp">
							Connected on {new Date(connectedAt).toLocaleDateString()}.
						</p>
					)}
					<div className="settingsActions">
						<button
							type="button"
							className="ibButton"
							onClick={handleDisconnect}
							disabled={disconnecting}
						>
							{disconnecting ? "Disconnecting..." : "Disconnect Square"}
						</button>
					</div>
				</div>
			) : (
				<div>
					<p className="settingsSquareStatus settingsSquareStatus--disconnected">
						Not connected
					</p>
					<div className="settingsActions">
						<button
							type="button"
							className="ibButton"
							onClick={handleConnect}
							disabled={urlLoading}
						>
							{urlLoading ? "Connecting..." : "Connect with Square"}
						</button>
					</div>
				</div>
			)}

			{error && <div className="settingsError">{error}</div>}
		</IBCardWrapper>
	);
};

export default SquarePanel;
