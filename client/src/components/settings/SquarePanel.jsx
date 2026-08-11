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
 * An artist's own Square connection.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE PANEL ON Shop.jsx. A Square account belongs to an owner, not
 * to a shop (DECISIONS.md M9). A shop admin connects the shop's account from the shop page; an
 * independent artist has no shop page and, until this, no way to connect one at all - they could
 * configure a tax rate and then take no card payment, which is the gap M9 was written to close.
 *
 * IT RENDERS FOR SHOP ARTISTS TOO, and says something different to them. Their sessions charge
 * into the SHOP's account (M8: tax is destination-based, and the offset follows the same owner),
 * so what they need to know is that the connection exists and is not theirs to manage. Hiding the
 * panel would leave "where does my money go" unanswered anywhere in the product; showing them a
 * connect button would invite them to build an account nothing routes to.
 *
 * `source` comes from the server rather than being inferred from whether the artist has a shop in
 * their session. Same rule, resolved once, in the same place as the tax rate.
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

	const { source, connected, connectedAt, ownerName } = data.getMySquareConnection;
	const isShopOwned = source === "shop";

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
					{isShopOwned
						? `Your sessions are charged through ${
								ownerName || "your shop"
						  }'s Square account. Only a shop admin can change this connection.`
						: "Connect Square to take card payments and deposits for your sessions."}
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
					{/* No disconnect button for a shop artist - it is not their account, and the
					    server refuses the mutation anyway. A button that always errors is worse
					    than no button. */}
					{!isShopOwned && (
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
					)}
				</div>
			) : (
				<div>
					<p className="settingsSquareStatus settingsSquareStatus--disconnected">
						{isShopOwned ? "Your shop has not connected Square yet." : "Not connected"}
					</p>
					{isShopOwned ? (
						<p className="settingsPanelHelp">
							Card payments and deposits are unavailable until a shop admin connects it.
						</p>
					) : (
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
					)}
				</div>
			)}

			{error && <div className="settingsError">{error}</div>}
		</IBCardWrapper>
	);
};

export default SquarePanel;
