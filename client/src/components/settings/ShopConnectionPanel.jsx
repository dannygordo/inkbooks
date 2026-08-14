import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBInput from "../inputs/IBInput";
import ArtistShopConnectionService from "../../services/ArtistShopConnectionService";
import ShopService from "../../services/ShopService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";

/**
 * An artist's own shop affiliation - connect, disconnect, or move to a different shop.
 *
 * Extracted from Settings.jsx (which used to own this inline, alongside everything else on the
 * page) as part of splitting Settings into one component per category - see
 * pages/settings/settingsCategories.js. Self-contained the same way AccountPanel already is:
 * reads the signed-in user via useAuth() rather than taking it as a prop, so the category shell
 * that renders this doesn't need to know anything about shop connections either.
 */
const ShopConnectionPanel = () => {
	const { user, setAlert, updateCurrentUser } = useAuth();
	const shopId = user.userInfo?.shop?.id;

	const [shopIdToConnect, setShopIdToConnect] = useState("");
	const [shopActionError, setShopActionError] = useState(null);
	// Set when the server refuses a connect because it would move this artist off their current
	// shop. Holds the shop names involved so the confirmation can name them - null the rest of the
	// time, which is also what closes the dialog.
	const [pendingTransfer, setPendingTransfer] = useState(null);
	const [showMoveForm, setShowMoveForm] = useState(false);
	const [connectArtistToShop, { loading: connecting }] = useMutation(
		ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION
	);
	const [disconnectArtistFromShop, { loading: disconnecting }] = useMutation(
		ArtistShopConnectionService.DISCONNECT_ARTIST_FROM_SHOP_MUTATION
	);
	// Lazy, not eager - connectArtistToShop's own response has no shop name/website to show (just
	// the raw ArtistShopConnection record), so this is triggered manually right after a successful
	// connect to fetch those two fields and update the cached user with them.
	const [fetchShopName] = ShopService.useLazyShop();

	// Shared by the first attempt and the confirmed retry - the only difference between them is
	// confirmTransfer, so the success path isn't written twice.
	const runConnect = async (targetShopId, confirmTransfer) => {
		await connectArtistToShop({
			variables: { artistId: user.id, shopId: targetShopId, confirmTransfer },
		});
		const { data } = await fetchShopName({ variables: { shopId: targetShopId } });
		updateCurrentUser({
			...user,
			userInfo: {
				...user.userInfo,
				shop: data?.getShop
					? { id: data.getShop.id, name: data.getShop.name, website: data.getShop.website }
					: { id: targetShopId },
			},
		});
		setShopIdToConnect("");
		setPendingTransfer(null);
		setShowMoveForm(false);
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message: "Connected to shop.",
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	const handleConnectToShop = async (e) => {
		e.preventDefault();
		setShopActionError(null);
		const trimmedShopId = shopIdToConnect.trim();
		if (!trimmedShopId) {
			setShopActionError("Enter the Shop ID your shop gave you.");
			return;
		}
		try {
			await runConnect(trimmedShopId, false);
		} catch (err) {
			// An artist works at one shop at a time, so connecting somewhere new ends the current
			// connection. The server refuses the first attempt and hands back which shop is being
			// left; this turns that into a confirmation naming both shops rather than a generic
			// "are you sure". See mutations/artistShopConnections.js.
			const transfer = err.graphQLErrors?.[0]?.extensions?.transfer;
			if (transfer?.requiresConfirmation) {
				setPendingTransfer({ ...transfer, targetShopId: trimmedShopId });
				return;
			}
			setShopActionError(err.graphQLErrors?.[0]?.message || err.message);
		}
	};

	const handleConfirmTransfer = async () => {
		const target = pendingTransfer;
		setShopActionError(null);
		try {
			await runConnect(target.targetShopId, true);
		} catch (err) {
			setPendingTransfer(null);
			setShopActionError(err.graphQLErrors?.[0]?.message || err.message);
		}
	};

	const handleDisconnectFromShop = async () => {
		if (
			!window.confirm(
				`Disconnect from ${user.userInfo?.shop?.name || "this shop"}? You can reconnect later.`
			)
		) {
			return;
		}
		try {
			await disconnectArtistFromShop({ variables: { artistId: user.id, shopId } });
			updateCurrentUser({
				...user,
				userInfo: { ...user.userInfo, shop: null },
			});
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: "Disconnected from shop.",
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		} catch (err) {
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.graphQLErrors?.[0]?.message || err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	// One form, rendered either as the first-time connect or as the move-shops form. IBInput is
	// uncontrolled (defaultValue only - see its own prop list), so onChange keeps shopIdToConnect
	// in sync and there's no value prop to feed back.
	const connectForm = (submitLabel) => (
		<form onSubmit={handleConnectToShop}>
			<IBInput
				id="shopIdToConnect"
				label="Shop ID"
				onChange={(e) => setShopIdToConnect(e.target.value)}
				placeholder="Ask your shop for their Shop ID"
			/>
			{shopActionError && <div className="settingsError">{shopActionError}</div>}
			<div className="settingsActions">
				<button type="submit" className="ibButton" disabled={connecting}>
					{connecting ? "Connecting..." : submitLabel}
				</button>
			</div>
		</form>
	);

	return (
		<>
			{/* Names both shops rather than warning generically. "You'll be disconnected from your
			    current shop" isn't something anyone can act on - the whole point of the
			    confirmation is that the person can see which shop they're about to lose. */}
			{pendingTransfer && (
				<div className="settingsConfirmBackdrop" role="dialog" aria-modal="true">
					<div className="settingsConfirmDialog">
						<h2>Move to {pendingTransfer.newShop?.name}?</h2>
						<p>
							You're currently connected to{" "}
							<strong>
								{pendingTransfer.currentShops?.map((c) => c.name).join(", ") ||
									"another shop"}
							</strong>
							.
						</p>
						<p>
							Connecting to <strong>{pendingTransfer.newShop?.name}</strong> will end that
							connection. You'll no longer be associated with{" "}
							{pendingTransfer.currentShops?.length === 1
								? pendingTransfer.currentShops[0].name
								: "your current shop"}
							, and their calendar, rates and shop-cut ledger will no longer apply to your
							work.
						</p>
						<p className="settingsConfirmNote">
							Your past appointments, projects and earnings stay exactly as they are.
						</p>
						<div className="settingsActions">
							<button
								type="button"
								className="ibButtonSecondary"
								onClick={() => setPendingTransfer(null)}
								disabled={connecting}
							>
								Cancel
							</button>
							<button
								type="button"
								className="ibButton"
								onClick={handleConfirmTransfer}
								disabled={connecting}
							>
								{connecting ? "Moving..." : "Continue"}
							</button>
						</div>
					</div>
				</div>
			)}
			<IBCardWrapper>
				<div>
					<h1>Shop Connection</h1>
					<p className="settingsPanelHelp">
						{shopId
							? "You're connected to this shop - your calendar, rate settings, and shop-cut ledger are all scoped to it."
							: "You're not currently connected to a shop - you're set up as an independent artist."}
					</p>
				</div>
				{shopId ? (
					<div>
						<p className="settingsShopName">{user.userInfo?.shop?.name || "Connected shop"}</p>
						{user.userInfo?.shop?.website && (
							<p className="settingsShopWebsite">{user.userInfo.shop.website}</p>
						)}
						<div className="settingsActions">
							<button
								type="button"
								className="ibButton"
								onClick={handleDisconnectFromShop}
								disabled={disconnecting}
							>
								{disconnecting ? "Disconnecting..." : "Disconnect from Shop"}
							</button>
							{/* Moving shops without disconnecting first is the normal case - people
							    change shops, they don't think to file paperwork about leaving the
							    old one. This is the path that produces the transfer confirmation
							    above; without it the guard would only ever be reachable by an
							    admin, and an artist who moved would have to know to disconnect
							    first. */}
							{!showMoveForm && (
								<button
									type="button"
									className="ibButtonSecondary"
									onClick={() => {
										setShopActionError(null);
										setShowMoveForm(true);
									}}
								>
									Move to a Different Shop
								</button>
							)}
						</div>
						{showMoveForm && (
							<div style={{ marginTop: 20 }}>
								<p className="settingsPanelHelp">
									Connecting to a different shop ends your connection to{" "}
									{user.userInfo?.shop?.name || "your current shop"}.
								</p>
								{connectForm("Move to This Shop")}
							</div>
						)}
					</div>
				) : (
					connectForm("Connect to Shop")
				)}
			</IBCardWrapper>
		</>
	);
};

export default ShopConnectionPanel;
