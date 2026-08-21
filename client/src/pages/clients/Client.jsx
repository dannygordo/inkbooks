import { useParams } from "react-router-dom";
import React, { useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import "./client.css";
import ClientService  from "../../services/ClientService";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBCardShowError from "../../components/card/ibCardShowError/IBCardShowError";
import IBCardWrapper from "../../components/card/ibCard/IBCardWrapper";
import IBInput from "../../components/inputs/IBInput";
import FormField from "../../components/formField/FormField";
import ClientDashboard from "../../components/clientDashboard/ClientDashboard";
import ArchiveControl from "../../components/archive/ArchiveControl";
import { useAuth } from "../../context/auth";
import { CLIENT_STATUS, ALERT_CONSTANTS } from "../../constants";

const Client = (props) => {
	let params = useParams();
    const errors = {};
	const { setAlert } = useAuth();
	/**
	 * Gets client by id
	 */
	const { loading, data, refetch } = ClientService.fetchClient(params.clientId);

	const [updateClient] = useMutation(ClientService.updateClient());
	const firstNameRef = useRef();
	const lastNameRef = useRef();
	const emailRef = useRef();
	const phoneRef = useRef();
	const addressRef = useRef();
	const cityRef = useRef();
	const stateRef = useRef();
	const zipRef = useRef();
	const instagramRef = useRef();
	const facebookRef = useRef();
	// Same bookkeeping as Project's Details panel (see Project.jsx's handleDetailFieldBlur) - a
	// serialized copy of the last payload actually sent, so tabbing through fields nobody touched
	// never fires a mutation.
	const lastSavedContactRef = useRef(null);
	const [contactSaveState, setContactSaveState] = useState("idle");

	// The corner "Edit" button is gone from every detail page. It was a fixed action in the top
	// right of a record that didn't say what it edited or where it went, and it was the only way
	// in - so viewing and editing were two separate destinations for the same record, with a
	// round trip between them. Rows now lead straight to the record, and editing belongs beside
	// the thing being edited rather than in a corner. The edit ROUTES are untouched and still
	// reachable directly; only the corner button is removed.
	//
	// What used to be a dead corner button and a separate /client/edit/:clientId route (the only
	// way to reach EditClient.jsx) is now the Contact Info panel below - the fields save
	// themselves on blur, the same pattern Project.jsx's Details panel and Shop.jsx's shop-cut
	// field already established.
	//
	// No client-side authorization gate here, deliberately. updateClient's real rule
	// (assertAdminAuthority, server/utils/shop-membership.js) is "a shop admin, OR an
	// independent artist with no shop at all acting on their own client" - and that second half
	// can't be answered client-side without an extra query this page has no other reason to make.
	// Hiding the panel for a legitimate independent artist would be a worse regression than
	// occasionally letting someone who isn't allowed try and get told no: an unauthorized save
	// fails loudly below (see handleContactFieldBlur's catch) rather than silently.
	const buildContactPayload = () => ({
		id: data.getClient.id,
		firstName: firstNameRef.current?.value ?? data.getClient.firstName,
		lastName: lastNameRef.current?.value ?? data.getClient.lastName,
		email: emailRef.current?.value ?? data.getClient.email,
		phone: phoneRef.current?.value ?? data.getClient.phone,
		address: addressRef.current?.value ?? data.getClient.address,
		city: cityRef.current?.value ?? data.getClient.city,
		state: stateRef.current?.value ?? data.getClient.state,
		zip: zipRef.current?.value ?? data.getClient.zip,
		instagram: instagramRef.current?.value ?? data.getClient.instagram,
		facebook: facebookRef.current?.value ?? data.getClient.facebook,
	});

	const handleContactFieldBlur = async () => {
		const payload = buildContactPayload();
		const serialized = JSON.stringify(payload);
		if (serialized === lastSavedContactRef.current) {
			return;
		}
		lastSavedContactRef.current = serialized;
		setContactSaveState("saving");
		try {
			await updateClient({ variables: { client: payload } });
			setContactSaveState("saved");
		} catch (err) {
			lastSavedContactRef.current = null;
			setContactSaveState("error");
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

	if (data) {
		return (
			<div className="client">
				<div className="clientHeader">
					<h1 className="clientTitle">
						{`${data.getClient.firstName} ${data.getClient.lastName}`}
					</h1>
					<ArchiveControl
						kind="client"
						name={`${data.getClient.firstName} ${data.getClient.lastName}`}
						isArchived={data.getClient.status === CLIENT_STATUS.ARCHIVED}
						archiveMutation={ClientService.ARCHIVE_CLIENT_MUTATION}
						unarchiveMutation={ClientService.UNARCHIVE_CLIENT_MUTATION}
						variables={{ clientId: data.getClient.id }}
						onChanged={refetch}
					/>
				</div>
				<IBCardWrapper>
					<div className="clientContactHeader">
						<h1>Contact Info</h1>
						<span
							className={`clientContactSaveState clientContactSaveState--${contactSaveState}`}
						>
							{contactSaveState === "saving" && "Saving..."}
							{contactSaveState === "saved" && "All changes saved"}
							{contactSaveState === "error" && "Couldn't save - try again"}
						</span>
					</div>
					<div className="ibFieldGroup">
						<div className="ibFieldRow">
							<FormField id="clientFirstName" label="First Name">
								<IBInput
									id="clientFirstName"
									inputRef={firstNameRef}
									defaultValue={data.getClient.firstName}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
							<FormField id="clientLastName" label="Last Name">
								<IBInput
									id="clientLastName"
									inputRef={lastNameRef}
									defaultValue={data.getClient.lastName}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="clientEmail" label="Email">
								<IBInput
									id="clientEmail"
									type="email"
									inputRef={emailRef}
									defaultValue={data.getClient.email}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
							<FormField id="clientPhone" label="Phone">
								<IBInput
									id="clientPhone"
									type="tel"
									inputRef={phoneRef}
									defaultValue={data.getClient.phone}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="clientAddress" label="Address">
								<IBInput
									id="clientAddress"
									inputRef={addressRef}
									defaultValue={data.getClient.address}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
							<FormField id="clientCity" label="City">
								<IBInput
									id="clientCity"
									inputRef={cityRef}
									defaultValue={data.getClient.city}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="clientState" label="State">
								<IBInput
									id="clientState"
									inputRef={stateRef}
									defaultValue={data.getClient.state}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
							<FormField id="clientZip" label="Zip">
								<IBInput
									id="clientZip"
									inputRef={zipRef}
									defaultValue={data.getClient.zip}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
						</div>
						<div className="ibFieldRow">
							<FormField id="clientInstagram" label="Instagram">
								<IBInput
									id="clientInstagram"
									inputRef={instagramRef}
									defaultValue={data.getClient.instagram}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
							<FormField id="clientFacebook" label="Facebook">
								<IBInput
									id="clientFacebook"
									inputRef={facebookRef}
									defaultValue={data.getClient.facebook}
									onBlur={handleContactFieldBlur}
								/>
							</FormField>
						</div>
					</div>
				</IBCardWrapper>
				{/* Was a name and an Edit button and nothing else. Same component a client sees
				    for themselves on Home.jsx, scoped differently - isSelf=false, so the
				    shop-side notes section renders here and not there. */}
				<ClientDashboard clientId={params.clientId} isSelf={false} />
			</div>
		);
	} else {
        errors.message = 'This client does not exist.';
		return <IBCardShowError errors={errors} />;
	}
};
export default Client