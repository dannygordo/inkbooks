import React from "react";
import { useMutation } from "@apollo/client";
import { Button } from "@mui/material";
import moment from "moment";
import NotificationService from "../../services/NotificationService";
import { formatCents } from "../../utils/money";

/**
 * One row in the inbox - a stored event or a live condition.
 *
 * They render almost identically on purpose. The one visible difference is that a condition has no
 * "done" button, because there is nothing to mark: it disappears when the underlying situation is
 * fixed and cannot be dismissed while still true. That is deliberate - the conditions are the
 * silent-failure catchers, and one you could wave away without fixing anything would be the least
 * trustworthy thing in the product.
 */
const CATEGORY_LABEL = {
	money: "Money",
	schedule: "Schedule",
	roster: "Team",
	message: "Message",
};

const NotificationItem = ({ item }) => {
	const [markDone] = useMutation(NotificationService.MARK_DONE, {
		refetchQueries: ["GetInbox"],
	});

	const unread = !item.isCondition && !item.readAt;
	const done = Boolean(item.doneAt);

	return (
		<div
			className={`notificationItem${unread ? " notificationItemUnread" : ""}${
				done ? " notificationItemDone" : ""
			}`}
		>
			<div className="notificationItemTop">
				<span className={`notificationCategory notificationCategory--${item.category}`}>
					{CATEGORY_LABEL[item.category] || item.category}
				</span>
				{/* Relative time, because "6 days ago" is the fact that matters for an unanswered
				    request. A condition's timestamp is when the situation STARTED, not when the
				    query ran, so this stays honest across refreshes. */}
				<span className="notificationWhen">{moment(item.createdAt).fromNow()}</span>
			</div>

			<div className="notificationTitle">{item.title}</div>
			{item.body && <div className="notificationBody">{item.body}</div>}
			{typeof item.amountCents === "number" && item.amountCents > 0 && (
				<div className="notificationAmount">{formatCents(item.amountCents)}</div>
			)}

			{!item.isCondition && !done && (
				<div className="notificationActions">
					{/* Done, not read. Reading "shop cut invoice issued" is not paying it, and an
					    inbox where read is the only tool ends up with read meaning nothing. */}
					<Button
						size="small"
						onClick={() => markDone({ variables: { notificationIds: [item.key] } })}
					>
						Mark handled
					</Button>
				</div>
			)}
			{item.isCondition && (
				<div className="notificationConditionNote">
					Clears itself once this is sorted.
				</div>
			)}
		</div>
	);
};

export default NotificationItem;
