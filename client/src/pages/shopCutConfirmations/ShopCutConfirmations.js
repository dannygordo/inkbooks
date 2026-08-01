import { useMutation } from "@apollo/client";
import moment from "moment";
import { useAuth } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import { ALERT_CONSTANTS } from "../../constants";
import "./shopCutConfirmations.css";

// Shop-side inbox for the manual mark-paid/confirm dual-control flow - see
// PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. An artist marking a shop cut as paid (e.g.
// cash) doesn't close the ledger item on its own; a shop admin has to independently confirm it
// here before it counts as paid.
const ShopCutConfirmations = () => {
	const { user, setAlert } = useAuth();
	const shopId = user.userInfo && user.userInfo.shop ? user.userInfo.shop.id : null;
	const { loading, data, refetch } = AppointmentService.getPendingShopCutConfirmations(shopId);
	const [confirmShopCutPaid] = useMutation(AppointmentService.CONFIRM_SHOP_CUT_PAID);

	const handleConfirm = (appointmentId) => {
		confirmShopCutPaid({ variables: { appointmentId } })
			.then(() => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
					message: "Marked as paid.",
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
				refetch();
			})
			.catch((err) => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: err.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			});
	};

	if (!shopId) {
		return (
			<div className="shopCutConfirmations">
				<h1 className="shopCutConfirmationsTitle">Pending Shop Cut Confirmations</h1>
				<p>This page is only available to shop accounts.</p>
			</div>
		);
	}

	if (loading) {
		return <IBPageLoader />;
	}

	const items = (data && data.getPendingShopCutConfirmations) || [];

	return (
		<div className="shopCutConfirmations">
			<h1 className="shopCutConfirmationsTitle">Pending Shop Cut Confirmations</h1>
			{items.length === 0 ? (
				<p>Nothing waiting on confirmation right now.</p>
			) : (
				<div className="shopCutConfirmationsList">
					{items.map((item) => (
						<div className="shopCutConfirmationRow" key={item.id}>
							<div className="shopCutConfirmationInfo">
								<div className="shopCutConfirmationArtist">
									{item.user ? `${item.user.firstName} ${item.user.lastName}` : "Artist"}
								</div>
								<div className="shopCutConfirmationDetail">
									{item.title || "Appointment"} -{" "}
									{moment.utc(item.appointmentDate).format("MMM D, YYYY")}
								</div>
								<div className="shopCutConfirmationAmount">
									{typeof item.shopCutAmount === "number"
										? `$${item.shopCutAmount.toFixed(2)}`
										: "Amount not set"}
								</div>
								<div className="shopCutConfirmationMarkedAt">
									Marked paid{" "}
									{item.shopCutMarkedPaidAt
										? moment.utc(item.shopCutMarkedPaidAt).fromNow()
										: ""}
								</div>
							</div>
							<button
								className="shopButton"
								onClick={() => handleConfirm(item.id)}
							>
								Confirm Received
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default ShopCutConfirmations;
