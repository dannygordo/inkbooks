import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS, ROLES } from "../../constants";
import "./archiveControl.css";

/**
 * Archive / restore, for the artist, staff and client detail pages.
 *
 * This is how someone is removed from the app. There is no delete - deleting an Artist, Staff or
 * Client row destroyed the records around it: projects left pointing at nothing, a User row
 * outliving its profile (a login with a role and no account behind it), and appointments keeping
 * their totals, shop cuts and Square invoice ids with nobody attached. See the note on the
 * Mutation type in server/graphql/typeDefs.js.
 *
 * The confirmation says what archiving does AND what it doesn't, because the second half is the
 * part people don't believe. "Remove this person" reads as "lose their history", and someone who
 * thinks they're about to lose a year of revenue records won't press the button - so they'll leave
 * departed artists on the roster forever instead, which is the outcome this is meant to prevent.
 *
 * Shop-admin only, matching the mutations' own minRole. Rendering it for staff would just produce
 * a button that errors.
 *
 * @param {string} kind - "artist" | "staff member" | "client", used in the prose
 * @param {string} name - who, so the confirmation names them
 * @param {boolean} isArchived - current state
 * @param {object} archiveMutation - gql document taking the id variable below
 * @param {object} unarchiveMutation - gql document taking the same
 * @param {object} variables - e.g. { artistId } - passed straight through
 * @param {function} onChanged - called after a successful archive/restore, to refetch
 */
const ArchiveControl = ({
	kind,
	name,
	isArchived,
	archiveMutation,
	unarchiveMutation,
	variables,
	onChanged,
}) => {
	const { user, setAlert } = useAuth();
	const [confirming, setConfirming] = useState(false);
	const [archive, { loading: archiving }] = useMutation(archiveMutation);
	const [unarchive, { loading: restoring }] = useMutation(unarchiveMutation);

	if (user?.role > ROLES.SHOP_ADMIN) {
		return null;
	}

	const busy = archiving || restoring;

	const run = async (mutate, successMessage) => {
		try {
			await mutate({ variables });
			setConfirming(false);
			if (onChanged) {
				onChanged();
			}
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: successMessage,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		} catch (err) {
			setConfirming(false);
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: err.graphQLErrors?.[0]?.message || err.message,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	// Restoring needs no confirmation - it's the undo, and nothing is lost by pressing it.
	if (isArchived) {
		return (
			<div className="archiveControl">
				<span className="archiveBadge">Archived</span>
				<button
					type="button"
					className="ibButtonSecondary"
					disabled={busy}
					onClick={() => run(unarchive, `${name} restored.`)}
				>
					{restoring ? "Restoring..." : "Restore"}
				</button>
			</div>
		);
	}

	return (
		<div className="archiveControl">
			{/* Hidden while the confirm dialog is open, not just visually covered by it - two
			    simultaneously-queryable "Archive" buttons is exactly the kind of thing that reads
			    fine to the eye (the backdrop covers this one) and ambiguous to anything walking the
			    accessibility tree, tests included. */}
			{!confirming && (
				<button
					type="button"
					className="ibButtonSecondary"
					disabled={busy}
					onClick={() => setConfirming(true)}
				>
					Archive
				</button>
			)}

			{confirming && (
				<div className="archiveConfirmBackdrop" role="dialog" aria-modal="true">
					<div className="archiveConfirmDialog">
						<h2>Archive {name}?</h2>
						<p>
							They'll no longer appear in your {kind} list or anywhere you pick a {kind}
							{kind === "artist" ? ", so no new work can be booked with them" : ""}.
						</p>
						{/* The reassurance is the point - see the note at the top of this file. */}
						<p className="archiveConfirmKept">
							Nothing they've already done changes. Their past appointments, projects and
							every dollar recorded against them stay exactly as they are, and still count
							toward your shop's revenue.
						</p>
						<p className="archiveConfirmNote">You can restore them at any time.</p>
						<div className="archiveConfirmActions">
							<button
								type="button"
								className="ibButtonSecondary"
								disabled={busy}
								onClick={() => setConfirming(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="ibButton"
								disabled={busy}
								onClick={() => run(archive, `${name} archived.`)}
							>
								{archiving ? "Archiving..." : "Archive"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default ArchiveControl;
