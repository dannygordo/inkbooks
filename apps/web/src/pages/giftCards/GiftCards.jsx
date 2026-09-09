import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, Checkbox, ToggleButton, ToggleButtonGroup } from "@mui/material";
import GiftCardService from "../../services/GiftCardService";
import IBGiftCardPaymentForm from "../../components/IBSquarePayments/IBGiftCardPaymentForm";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import FormField from "../../components/formField/FormField";
import IBInput from "../../components/inputs/IBInput";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { isShopAdminOrBetter } from "../../utils/businessScope";
import { formatCents, dollarsToCents } from "../../utils/money";
import "./giftCards.css";

const ISSUER_LABEL = { ARTIST: "Artist-issued", SHOP: "Shop-issued" };

const SHOP_CUT_STATUS_LABEL = {
	none: "None",
	unpaid: "Unpaid",
	invoice_sent: "Invoice sent",
	pending_confirmation: "Pending confirmation",
	paid: "Paid",
	received: "Received",
};

/**
 * Gift cards - the last item on HANDOFF.md's 2026-09-04 mobile-parity list (gap 5), and the first
 * platform this feature has any UI at all: DECISIONS.md M6 shipped the money model and the
 * resolvers with nothing built on top, because "sell a gift card" had no answer yet for how a
 * real card sale actually collects payment. That follow-up (see this file's own services -
 * GiftCardService.js's header comment) is what this page is: every artist can sell their own
 * artist-issued card (createArtistGiftCard, ROLES.ARTIST floor - see resolvers/giftCards.js), and
 * a shop admin can additionally sell the shop's own product (createShopGiftCard, SHOP_ADMIN
 * floor) and settle what each shop-issued card's cut owes the shop.
 *
 * There is no "redeem a gift card" UI here on purpose - spending one is something that happens
 * AT a session, not from a management page, so that lives in SessionDetail.jsx instead (mirrors
 * the deposit-apply UI's own placement there).
 *
 * Gates match Sidebar.jsx's link to this page exactly:
 * - isArtist (userType === "artist"): sees "Your gift cards" + can sell an artist-issued card,
 *   shop-connected or not - getMyGiftCards has no shop dependency (issuerArtistId: user.id only).
 * - isAdmin (shop-admin-or-better) with a shop: additionally sees "Shop gift cards" + can sell a
 *   shop-issued card + settle shop-issued cards' cuts.
 * A user who is neither (e.g. shop staff with no Artist record) sees an empty page rather than a
 * broken one - matches createArtistGiftCard's own "only an artist can sell their own gift card"
 * check, which a staff-only account would fail server-side anyway.
 */
const GiftCards = () => {
	const { user, setAlert } = useAuth();
	const isArtist = user.userType === "artist";
	const isAdmin = isShopAdminOrBetter(user);
	const shopId = user.userInfo?.shop?.id || null;

	const showError = (err) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.ERROR,
			message: err.graphQLErrors?.[0]?.message || err.message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};
	const showSuccess = (message) => {
		setAlert({
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});
	};

	// --- Data ------------------------------------------------------------------------------
	const {
		data: myCardsData,
		loading: myCardsLoading,
		refetch: refetchMyCards,
	} = GiftCardService.getMyGiftCards({ skip: !isArtist });
	const {
		data: shopCardsData,
		loading: shopCardsLoading,
		refetch: refetchShopCards,
	} = GiftCardService.getGiftCardsByShop(shopId, { skip: !isAdmin || !shopId });
	const { data: myLiabilityData, refetch: refetchMyLiability } =
		GiftCardService.getMyGiftCardLiabilityReport({ skip: !isArtist });
	const { data: shopLiabilityData, refetch: refetchShopLiability } =
		GiftCardService.getGiftCardLiabilityReport(shopId, { skip: !isAdmin || !shopId });

	const myCards = myCardsData?.getMyGiftCards || [];
	const shopCards = shopCardsData?.getGiftCardsByShop || [];
	const myLiability = myLiabilityData?.getMyGiftCardLiabilityReport;
	const shopLiability = shopLiabilityData?.getGiftCardLiabilityReport;

	const refetchEverything = async () => {
		await Promise.all([
			isArtist && refetchMyCards(),
			isArtist && refetchMyLiability(),
			isAdmin && shopId && refetchShopCards(),
			isAdmin && shopId && refetchShopLiability(),
		]);
	};

	// --- Sell an artist-issued card ---------------------------------------------------------
	const [artistFaceDollars, setArtistFaceDollars] = useState("");
	const [artistApplyOffset, setArtistApplyOffset] = useState(false);
	const [artistPaymentMethod, setArtistPaymentMethod] = useState(null);
	const [pendingArtistSale, setPendingArtistSale] = useState(null);
	const [artistSubmitting, setArtistSubmitting] = useState(false);
	const [createArtistGiftCard] = useMutation(GiftCardService.CREATE_ARTIST_GIFT_CARD);

	const handleSellArtistCard = async (e) => {
		e.preventDefault();
		const faceValueCents = dollarsToCents(artistFaceDollars);
		if (faceValueCents <= 0 || !artistPaymentMethod) {
			return;
		}
		setArtistSubmitting(true);
		try {
			const { data } = await createArtistGiftCard({
				variables: {
					input: {
						faceValueCents,
						applyFeeOffset: artistApplyOffset,
						paymentMethod: artistPaymentMethod,
						pending: artistPaymentMethod === "square" ? true : undefined,
					},
				},
			});
			const card = data.createArtistGiftCard;
			if (artistPaymentMethod === "square") {
				// Recorded, not yet collected - see GiftCardService.js's own header comment. The
				// payment form below reads the amount from the pending card itself; nothing here
				// re-sends what to charge.
				setPendingArtistSale({
					giftCardId: card.id,
					amountCents: card.faceValueCents + card.feeOffsetCents,
					code: card.code,
				});
			} else {
				showSuccess(`Sold a ${formatCents(card.faceValueCents)} gift card - code ${card.code}.`);
				setArtistFaceDollars("");
				setArtistApplyOffset(false);
				setArtistPaymentMethod(null);
			}
			await refetchEverything();
		} catch (err) {
			showError(err);
		} finally {
			setArtistSubmitting(false);
		}
	};

	const handleArtistCardPaid = async () => {
		showSuccess(`Card charged - code ${pendingArtistSale.code}.`);
		setPendingArtistSale(null);
		setArtistFaceDollars("");
		setArtistApplyOffset(false);
		setArtistPaymentMethod(null);
		await refetchEverything();
	};

	// --- Sell a shop-issued card (admin only) -----------------------------------------------
	const [shopFaceDollars, setShopFaceDollars] = useState("");
	const [shopApplyOffset, setShopApplyOffset] = useState(false);
	const [shopPaymentMethod, setShopPaymentMethod] = useState(null);
	const [pendingShopSale, setPendingShopSale] = useState(null);
	const [shopSubmitting, setShopSubmitting] = useState(false);
	const [createShopGiftCard] = useMutation(GiftCardService.CREATE_SHOP_GIFT_CARD);

	const handleSellShopCard = async (e) => {
		e.preventDefault();
		const faceValueCents = dollarsToCents(shopFaceDollars);
		if (faceValueCents <= 0 || !shopPaymentMethod || !shopId) {
			return;
		}
		setShopSubmitting(true);
		try {
			const { data } = await createShopGiftCard({
				variables: {
					input: {
						shopId,
						faceValueCents,
						applyFeeOffset: shopApplyOffset,
						paymentMethod: shopPaymentMethod,
						pending: shopPaymentMethod === "square" ? true : undefined,
					},
				},
			});
			const card = data.createShopGiftCard;
			if (shopPaymentMethod === "square") {
				setPendingShopSale({
					giftCardId: card.id,
					amountCents: card.faceValueCents + card.feeOffsetCents,
					code: card.code,
				});
			} else {
				showSuccess(`Sold a ${formatCents(card.faceValueCents)} shop gift card - code ${card.code}.`);
				setShopFaceDollars("");
				setShopApplyOffset(false);
				setShopPaymentMethod(null);
			}
			await refetchEverything();
		} catch (err) {
			showError(err);
		} finally {
			setShopSubmitting(false);
		}
	};

	const handleShopCardPaid = async () => {
		showSuccess(`Card charged - code ${pendingShopSale.code}.`);
		setPendingShopSale(null);
		setShopFaceDollars("");
		setShopApplyOffset(false);
		setShopPaymentMethod(null);
		await refetchEverything();
	};

	// --- Shop-cut settlement (shop-issued cards only) - mirrors ShopCutPayoutList.jsx's own
	// three actions for Appointments, against a GiftCard instead. ---------------------------
	const [createGiftCardShopCutInvoice, { loading: invoicingCut }] = useMutation(
		GiftCardService.CREATE_GIFT_CARD_SHOP_CUT_INVOICE
	);
	const [markGiftCardShopCutPaidManually, { loading: markingCutPaid }] = useMutation(
		GiftCardService.MARK_GIFT_CARD_SHOP_CUT_PAID_MANUALLY
	);
	const [confirmGiftCardShopCutPaid, { loading: confirmingCut }] = useMutation(
		GiftCardService.CONFIRM_GIFT_CARD_SHOP_CUT_PAID
	);

	const handleInvoiceCut = (giftCardId) => async () => {
		try {
			const { data } = await createGiftCardShopCutInvoice({
				variables: { giftCardId, paymentMethod: "card" },
			});
			showSuccess(`Invoice sent: ${data.createGiftCardShopCutInvoice.invoiceUrl}`);
			await refetchEverything();
		} catch (err) {
			showError(err);
		}
	};

	const handleMarkCutPaidCash = (giftCardId) => async () => {
		try {
			await markGiftCardShopCutPaidManually({ variables: { giftCardId } });
			showSuccess("Marked as paid - the shop has been notified to confirm.");
			await refetchEverything();
		} catch (err) {
			showError(err);
		}
	};

	const handleConfirmCutPaid = (giftCardId) => async () => {
		try {
			await confirmGiftCardShopCutPaid({ variables: { giftCardId } });
			showSuccess("Confirmed received.");
			await refetchEverything();
		} catch (err) {
			showError(err);
		}
	};

	if (!isArtist && !isAdmin) {
		return (
			<div className="giftCardsPage">
				<h1>Gift Cards</h1>
				<p className="clientDashboardEmpty">Nothing to manage here.</p>
			</div>
		);
	}

	return (
		<div className="giftCardsPage">
			<h1>Gift Cards</h1>
			<p className="settingsPanelHelp">
				A card sold for cash is spendable right away. A card sold by Square is only spendable
				once the charge actually goes through - see the note on each pending card below.
			</p>

			{isArtist && (
				<div className="giftCardsSection">
					<h2>Sell your own gift card</h2>
					{pendingArtistSale ? (
						<div className="giftCardsPendingSale">
							<p className="giftCardsPendingSaleNote">
								Card {pendingArtistSale.code} recorded - take the{" "}
								{formatCents(pendingArtistSale.amountCents)} charge to finish.
							</p>
							<IBGiftCardPaymentForm
								giftCardId={pendingArtistSale.giftCardId}
								amountCents={pendingArtistSale.amountCents}
								note={`InkBooks gift card ${pendingArtistSale.code}`}
								onSuccess={handleArtistCardPaid}
								onError={(message) => showError({ message })}
							/>
						</div>
					) : (
						<form className="giftCardsSellForm" onSubmit={handleSellArtistCard}>
							<FormField id="artistGiftCardFace" label="Face value $">
								<IBInput
									id="artistGiftCardFace"
									type="number"
									value={artistFaceDollars}
									onChange={(e) => setArtistFaceDollars(e.target.value)}
								/>
							</FormField>
							<div className="giftCardsOffsetRow">
								<Checkbox
									checked={artistApplyOffset}
									onChange={(e) => setArtistApplyOffset(e.target.checked)}
									id="artistGiftCardOffset"
								/>
								<label htmlFor="artistGiftCardOffset">
									Add the Square processing-fee offset (never loads onto the card's balance)
								</label>
							</div>
							<div className="giftCardsMethodRow">
								<span className="giftCardsMethodLabel">How is it being paid for?</span>
								<ToggleButtonGroup
									exclusive
									size="small"
									value={artistPaymentMethod}
									onChange={(_, next) => next && setArtistPaymentMethod(next)}
								>
									<ToggleButton value="cash">Cash</ToggleButton>
									<ToggleButton value="square">Card (Square)</ToggleButton>
								</ToggleButtonGroup>
							</div>
							<Button
								type="submit"
								variant="contained"
								disabled={
									artistSubmitting ||
									dollarsToCents(artistFaceDollars) <= 0 ||
									!artistPaymentMethod
								}
							>
								{artistSubmitting ? "Selling..." : "Sell gift card"}
							</Button>
						</form>
					)}
				</div>
			)}

			{isAdmin && shopId && (
				<div className="giftCardsSection">
					<h2>Sell a shop gift card</h2>
					<p className="settingsPanelHelp">
						Sold as a shop product, at 100% owed to the shop - not your own artist rate.
						Redeemable against any artist's session at this shop.
					</p>
					{pendingShopSale ? (
						<div className="giftCardsPendingSale">
							<p className="giftCardsPendingSaleNote">
								Card {pendingShopSale.code} recorded - take the{" "}
								{formatCents(pendingShopSale.amountCents)} charge to finish.
							</p>
							<IBGiftCardPaymentForm
								giftCardId={pendingShopSale.giftCardId}
								amountCents={pendingShopSale.amountCents}
								note={`InkBooks shop gift card ${pendingShopSale.code}`}
								onSuccess={handleShopCardPaid}
								onError={(message) => showError({ message })}
							/>
						</div>
					) : (
						<form className="giftCardsSellForm" onSubmit={handleSellShopCard}>
							<FormField id="shopGiftCardFace" label="Face value $">
								<IBInput
									id="shopGiftCardFace"
									type="number"
									value={shopFaceDollars}
									onChange={(e) => setShopFaceDollars(e.target.value)}
								/>
							</FormField>
							<div className="giftCardsOffsetRow">
								<Checkbox
									checked={shopApplyOffset}
									onChange={(e) => setShopApplyOffset(e.target.checked)}
									id="shopGiftCardOffset"
								/>
								<label htmlFor="shopGiftCardOffset">
									Add the Square processing-fee offset (never loads onto the card's balance)
								</label>
							</div>
							<div className="giftCardsMethodRow">
								<span className="giftCardsMethodLabel">How is it being paid for?</span>
								<ToggleButtonGroup
									exclusive
									size="small"
									value={shopPaymentMethod}
									onChange={(_, next) => next && setShopPaymentMethod(next)}
								>
									<ToggleButton value="cash">Cash</ToggleButton>
									<ToggleButton value="square">Card (Square)</ToggleButton>
								</ToggleButtonGroup>
							</div>
							<Button
								type="submit"
								variant="contained"
								disabled={
									shopSubmitting || dollarsToCents(shopFaceDollars) <= 0 || !shopPaymentMethod
								}
							>
								{shopSubmitting ? "Selling..." : "Sell gift card"}
							</Button>
						</form>
					)}
				</div>
			)}

			{isArtist && (
				<div className="giftCardsSection">
					<h2>Your gift cards</h2>
					{myLiability && myLiability.cardCount > 0 && (
						<p className="giftCardsLiabilityNote">
							{formatCents(myLiability.outstandingBalanceCents)} outstanding across{" "}
							{myLiability.cardCount} card{myLiability.cardCount === 1 ? "" : "s"}
							{myLiability.oldestIssuedAt
								? ` - oldest issued ${new Date(myLiability.oldestIssuedAt).toLocaleDateString()}`
								: ""}
							.
						</p>
					)}
					{myCardsLoading ? (
						<IBPageLoader />
					) : myCards.length === 0 ? (
						<p className="clientDashboardEmpty">No gift cards sold yet.</p>
					) : (
						<GiftCardList
							cards={myCards}
							showArtistCutActions
							invoicingCut={invoicingCut}
							markingCutPaid={markingCutPaid}
							confirmingCut={confirmingCut}
							onInvoiceCut={handleInvoiceCut}
							onMarkCutPaidCash={handleMarkCutPaidCash}
							onConfirmCutPaid={handleConfirmCutPaid}
							viewerId={user.id}
						/>
					)}
				</div>
			)}

			{isAdmin && shopId && (
				<div className="giftCardsSection">
					<h2>Shop gift cards</h2>
					{shopLiability && shopLiability.cardCount > 0 && (
						<p className="giftCardsLiabilityNote">
							{formatCents(shopLiability.outstandingBalanceCents)} outstanding across{" "}
							{shopLiability.cardCount} card{shopLiability.cardCount === 1 ? "" : "s"}
							{shopLiability.oldestIssuedAt
								? ` - oldest issued ${new Date(shopLiability.oldestIssuedAt).toLocaleDateString()}`
								: ""}
							.
						</p>
					)}
					{shopCardsLoading ? (
						<IBPageLoader />
					) : shopCards.length === 0 ? (
						<p className="clientDashboardEmpty">No gift cards sold at this shop yet.</p>
					) : (
						<GiftCardList
							cards={shopCards}
							showArtistCutActions
							invoicingCut={invoicingCut}
							markingCutPaid={markingCutPaid}
							confirmingCut={confirmingCut}
							onInvoiceCut={handleInvoiceCut}
							onMarkCutPaidCash={handleMarkCutPaidCash}
							onConfirmCutPaid={handleConfirmCutPaid}
							viewerId={user.id}
							isShopWide
						/>
					)}
				</div>
			)}
		</div>
	);
};

/**
 * One card's row: identity, balance, sale status, and - only for a SHOP-issued card whose cut is
 * still unsettled - the same three settlement actions ShopCutPayoutList.jsx offers for an
 * Appointment (invoice/mark paid cash/confirm received), since GiftCard's shop-cut fields are the
 * same shape by design (models/GiftCard.js). "Confirm received" only makes sense for whoever is
 * NOT the seller - shown to the viewer whenever they aren't soldByUserId, same asymmetry
 * confirmShopCutPaid already has for Appointments.
 */
const GiftCardList = ({
	cards,
	invoicingCut,
	markingCutPaid,
	confirmingCut,
	onInvoiceCut,
	onMarkCutPaidCash,
	onConfirmCutPaid,
	viewerId,
	isShopWide = false,
}) => {
	return (
		<div className="giftCardsList">
			{cards.map((card) => {
				const isPending = card.saleStatus === "pending";
				const isSoldByViewer = String(card.soldByUserId) === String(viewerId);
				const cutUnsettled =
					card.issuerType === "SHOP" && card.shopCutCents > 0 && !isPending;
				return (
					<div key={card.id} className="giftCardRow">
						<div className="giftCardRowMain">
							<span className="giftCardRowCode">{card.code}</span>
							<span className="giftCardRowMeta">
								{ISSUER_LABEL[card.issuerType] || card.issuerType}
								{" · "}
								{formatCents(card.balanceCents)} of {formatCents(card.faceValueCents)} left
								{" · "}
								{isPending
									? `Payment pending (${card.paymentMethod})`
									: `Sold via ${card.paymentMethod}`}
							</span>
							{card.issuerType === "SHOP" && (
								<span className="giftCardRowMeta">
									Shop cut: {SHOP_CUT_STATUS_LABEL[card.shopCutStatus] || card.shopCutStatus}
									{card.shopCutCents ? ` (${formatCents(card.shopCutCents)})` : ""}
								</span>
							)}
						</div>
						{cutUnsettled && card.shopCutStatus === "unpaid" && isSoldByViewer && (
							<div className="giftCardRowActions">
								<Button
									size="small"
									variant="outlined"
									disabled={markingCutPaid}
									onClick={onMarkCutPaidCash(card.id)}
								>
									Paid (Cash)
								</Button>
								<Button
									size="small"
									variant="outlined"
									disabled={invoicingCut}
									onClick={onInvoiceCut(card.id)}
								>
									Charge (Card)
								</Button>
							</div>
						)}
						{cutUnsettled && card.shopCutStatus === "pending_confirmation" && !isSoldByViewer && (
							<div className="giftCardRowActions">
								<Button
									size="small"
									variant="contained"
									disabled={confirmingCut}
									onClick={onConfirmCutPaid(card.id)}
								>
									Confirm Received
								</Button>
							</div>
						)}
						{/* Only meaningful in the shop-wide list - someone else's card in "your own
						    cards" can't happen (getMyGiftCards is already scoped to issuerArtistId:
						    you). Matches ShopCutPayoutList.jsx's own "Owed by X" read-only fallback:
						    the mutations above are self-service (soldByUserId-checked server-side),
						    so a row that isn't the viewer's own sale gets a status line instead of
						    buttons that would just 403. */}
						{isShopWide &&
							cutUnsettled &&
							card.shopCutStatus === "unpaid" &&
							!isSoldByViewer && (
								<div className="giftCardRowActions giftCardRowActionsReadOnly">
									Owed by the person who sold it
								</div>
							)}
					</div>
				);
			})}
		</div>
	);
};

export default GiftCards;
