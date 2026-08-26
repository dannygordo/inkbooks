import { useParams } from "react-router-dom";
import React, { useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import "./staffProfile.css";
import StaffService  from "../../services/StaffService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";
import IBCardWrapper from "../../components/card/ibCard/IBCardWrapper";
import IBInput from "../../components/inputs/IBInput";
import FormField from "../../components/formField/FormField";
import ArchiveControl from "../../components/archive/ArchiveControl";
import { useAuth } from "../../context/auth";
import { STAFF_STATUS, ROLES, ALERT_CONSTANTS } from "../../constants";

const StaffProfile = (props) => {
	let params = useParams();
    const errors = {};
	const { user, setAlert } = useAuth();
	/**
	 * Gets staffProfile by id
	 */
	const { loading, data, refetch } = StaffService.fetchOneStaff(params.staffId);

	const [updateStaff] = useMutation(StaffService.updateStaff());
	const firstNameRef = useRef();
	const lastNameRef = useRef();
	const emailRef = useRef();
	const phoneRef = useRef();
	const titleRef = useRef();
	const addressRef = useRef();
	const cityRef = useRef();
	const stateRef = useRef();
	const zipRef = useRef();
	const instagramRef = useRef();
	const facebookRef = useRef();
	const lastSavedIdentityRef = useRef(null);
	const [identitySaveState, setIdentitySaveState] = useState("idle");

	// The corner "Edit" button is gone from every detail page. It was a fixed action in the top
	// right of a record that didn't say what it edited or where it went, and it was the only way
	// in - so viewing and editing were two separate destinations for the same record, with a
	// round trip between them. Rows now lead straight to the record, and editing belongs beside
	// the thing being edited rather than in a corner. The edit ROUTES are untouched and still
	// reachable directly; only the corner button is removed.
	//
	// updateStaff has a hard SHOP_ADMIN floor server-side (mutations/staff.js's withAuth call) -
	// there is no self-service path the way updateArtist has, so this page's fields are read-only
	// for anyone below that, which is also why this is the first time these fields are DISPLAYED
	// at all rather than just editable - previously this page showed a name and nothing else.
	const canEditIdentity = user.role <= ROLES.SHOP_ADMIN;

	// `||`, not `??`: once a field's input has mounted, a null/undefined underlying value
	// still leaves ref.current.value as a real empty string (the DOM has no way to represent
	// an unset text input), so `?? data.field` never actually falls through post-mount and a
	// field that was genuinely null got silently written back as "" on every unrelated blur.
	// `||` falls back to the original value both before mount (ref undefined) and for an
	// untouched-but-null field after mount (ref.current.value === ""), and still prefers
	// anything actually typed.
	const buildIdentityPayload = () => ({
		id: data.getOneStaff.id,
		firstName: firstNameRef.current?.value || data.getOneStaff.firstName,
		lastName: lastNameRef.current?.value || data.getOneStaff.lastName,
		email: emailRef.current?.value || data.getOneStaff.email,
		phone: phoneRef.current?.value || data.getOneStaff.phone,
		title: titleRef.current?.value || data.getOneStaff.title,
		address: addressRef.current?.value || data.getOneStaff.address,
		city: cityRef.current?.value || data.getOneStaff.city,
		state: stateRef.current?.value || data.getOneStaff.state,
		zip: zipRef.current?.value || data.getOneStaff.zip,
		instagram: instagramRef.current?.value || data.getOneStaff.instagram,
		facebook: facebookRef.current?.value || data.getOneStaff.facebook,
		// StaffInput requires these three as non-null - echoed back unchanged since nothing here
		// edits them (status has its own door, ArchiveControl; shopId/userId aren't user-editable).
		shopId: data.getOneStaff.shopId,
		userId: data.getOneStaff.userId,
		status: data.getOneStaff.status,
	});

	const handleIdentityFieldBlur = async () => {
		const payload = buildIdentityPayload();
		const serialized = JSON.stringify(payload);
		if (serialized === lastSavedIdentityRef.current) {
			return;
		}
		lastSavedIdentityRef.current = serialized;
		setIdentitySaveState("saving");
		try {
			await updateStaff({ variables: { staff: payload } });
			setIdentitySaveState("saved");
		} catch (err) {
			lastSavedIdentityRef.current = null;
			setIdentitySaveState("error");
			setAlert({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: `Couldn't save: ${err.graphQLErrors?.[0]?.message || err.message}`,
				timeout: ALERT_CONSTANTS.TIMEOUT,
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			});
		}
	};

	if (loading) {
		return <IBPageLoader />;
	}
	// Lazy baseline init (allowed during render for a ref - see React's own docs on this
	// exact pattern): lastSavedIdentityRef starts null, and buildIdentityPayload/buildContactPayload/
	// etc. fall back to data's own values for every ref that hasn't attached to a real input
	// yet, which is exactly every ref on the render where data first arrives. Without this,
	// the first blur ever - even one that changed nothing - always looks 'dirty' against a
	// null baseline and fires a save no one asked for.
	if (data && data.getOneStaff && lastSavedIdentityRef.current === null) {
		lastSavedIdentityRef.current = JSON.stringify(buildIdentityPayload());
	}

	if (data && data.getOneStaff) {
		return (
			<div className="staffProfile">
				<div className="staffProfileHeader">
					<h1 className="staffProfileTitle">
						{`${data.getOneStaff.firstName} ${data.getOneStaff.lastName}`}
					</h1>
					<ArchiveControl
						kind="staff member"
						name={`${data.getOneStaff.firstName} ${data.getOneStaff.lastName}`}
						isArchived={data.getOneStaff.status === STAFF_STATUS.ARCHIVED}
						archiveMutation={StaffService.ARCHIVE_STAFF_MUTATION}
						unarchiveMutation={StaffService.UNARCHIVE_STAFF_MUTATION}
						variables={{ staffId: data.getOneStaff.id }}
						onChanged={refetch}
					/>
				</div>
				<IBCardWrapper>
					<div className="staffProfileIdentityHeader">
						<h1>Details</h1>
						<span
							className={`staffProfileIdentitySaveState staffProfileIdentitySaveState--${identitySaveState}`}
						>
							{identitySaveState === "saving" && "Saving..."}
							{identitySaveState === "saved" && "All changes saved"}
							{identitySaveState === "error" && "Couldn't save - try again"}
						</span>
					</div>
					{!canEditIdentity && (
						<p className="staffProfileIdentityHint">
							Only a shop admin can edit these details.
						</p>
					)}
					<div className="ibFieldGroup">
						<div className="ibFieldRow">
							<FormField id="staffFirstName" label="First Name">
								<IBInput
									id="staffFirstName"
									inputRef={firstNameRef}
									defaultValue={data.getOneStaff.firstName}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="staffLastName" label="Last Name">
								<IBInput
									id="staffLastName"
									inputRef={lastNameRef}
									defaultValue={data.getOneStaff.lastName}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="staffEmail" label="Email">
								<IBInput
									id="staffEmail"
									type="email"
									inputRef={emailRef}
									defaultValue={data.getOneStaff.email}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="staffPhone" label="Phone">
								<IBInput
									id="staffPhone"
									type="tel"
									inputRef={phoneRef}
									defaultValue={data.getOneStaff.phone}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<FormField id="staffTitle" label="Title">
							<IBInput
								id="staffTitle"
								inputRef={titleRef}
								defaultValue={data.getOneStaff.title}
								disabled={!canEditIdentity}
								onBlur={handleIdentityFieldBlur}
							/>
						</FormField>
						<div className="ibFieldRow">
							<FormField id="staffAddress" label="Address">
								<IBInput
									id="staffAddress"
									inputRef={addressRef}
									defaultValue={data.getOneStaff.address}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="staffCity" label="City">
								<IBInput
									id="staffCity"
									inputRef={cityRef}
									defaultValue={data.getOneStaff.city}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="staffState" label="State">
								<IBInput
									id="staffState"
									inputRef={stateRef}
									defaultValue={data.getOneStaff.state}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="staffZip" label="Zip">
								<IBInput
									id="staffZip"
									inputRef={zipRef}
									defaultValue={data.getOneStaff.zip}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="staffInstagram" label="Instagram">
								<IBInput
									id="staffInstagram"
									inputRef={instagramRef}
									defaultValue={data.getOneStaff.instagram}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
							<FormField id="staffFacebook" label="Facebook">
								<IBInput
									id="staffFacebook"
									inputRef={facebookRef}
									defaultValue={data.getOneStaff.facebook}
									disabled={!canEditIdentity}
									onBlur={handleIdentityFieldBlur}
								/>
							</FormField>
						</div>
					</div>
				</IBCardWrapper>
			</div>
		);
	} else {
        errors.message = 'This staffProfile does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default StaffProfile