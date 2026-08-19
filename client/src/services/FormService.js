import { gql, useQuery } from "@apollo/client";

/**
 * Forms - consent forms, waivers, custom intake questionnaires. See server/graphql/typeDefs.js's
 * own header on this feature for the ownership model (shopId XOR artistUserId, same as Expenses/
 * Income - see ExpenseService.js, which this mirrors) and models/FormResponse.js for why a
 * response's fieldsSnapshot/answers are read from the RESPONSE, never re-resolved through a live
 * Form.
 *
 * A separate feature from BookingRequestService.js - see models/Form.js's own header comment on
 * why. This file's getPublicForm/SUBMIT_FORM_RESPONSE are the ones a public, unauthenticated page
 * (PublicFormFillOut.jsx) calls directly with its own useQuery/useMutation, the same way
 * BookingRequest.jsx calls getPublicArtistProfile - see that file for the precedent this follows.
 *
 * NOTE ON THE FIELD-SHAPE STRINGS BELOW: each bare `const _X_FIELDS = \`...\`` is kept FULLY
 * SELF-CONTAINED (no `${otherConst}` interpolation of another bare const inside it), even at the
 * cost of repeating the same six-line field shape in three places. scripts/check-graphql-
 * documents.js only resolves one level of `${name}` splicing for these untagged literals - a
 * const that itself interpolates another untagged const leaves that inner `${...}` unresolved
 * once spliced into the real gql document, which the checker then strips to nothing rather than
 * expanding, silently producing an empty (invalid) selection set. ExpenseService.js never hits
 * this because none of its own bare field-list consts reference each other. Only a real gql`` tag
 * (CREATE_FORM, GET_PUBLIC_FORM, etc.) may safely interpolate one of these bare consts, since the
 * checker resolves top-level interpolations into an actual tagged document correctly.
 */
const FormService = (() => {
	const _FORM_FIELD_FIELDS = `
		key
		type
		label
		helpText
		required
		options
		hidden
	`;

	const _FORM_FIELDS = `
		id
		shopId
		artistUserId
		title
		description
		status
		allowGuestSubmissions
		publicToken
		slug
		shopUseOnly
		systemKey
		fields {
			key
			type
			label
			helpText
			required
			options
			hidden
		}
		createdByUserId
		createdBy {
			id
			firstName
			lastName
		}
		createdAt
		updatedAt
	`;

	const _FETCH_FORMS = gql`
		query GetForms($shopId: ID, $artistUserId: ID, $status: String, $page: PageInput) {
			getForms(shopId: $shopId, artistUserId: $artistUserId, status: $status, page: $page) {
				items {
					${_FORM_FIELDS}
				}
				pageInfo { totalCount hasMore limit offset }
			}
		}
	`;
	const _getForms = (scope, status, page, options = {}) => {
		return useQuery(_FETCH_FORMS, {
			variables: { ...scope, status: status || null, page },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _FETCH_FORM = gql`
		query GetForm($formId: ID!) {
			getForm(formId: $formId) {
				${_FORM_FIELDS}
			}
		}
	`;
	const _getForm = (formId, options = {}) => {
		return useQuery(_FETCH_FORM, {
			variables: { formId },
			skip: !formId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	// PUBLIC - no scope, no auth. Named separately from _FETCH_FORM/getForm above rather than
	// reused: PublicForm is a deliberately different, stripped-down GraphQL type (see
	// typeDefs.js's own comment - no shopId/artistUserId/status/publicToken), so its selection set
	// can never accidentally ask for a field a guest has no business reading. This is a real gql``
	// tag, so interpolating the bare _FORM_FIELD_FIELDS const directly here (a single level) is
	// safe - see this file's own header comment.
	const GET_PUBLIC_FORM = gql`
		query GetPublicForm($publicToken: String!) {
			getPublicForm(publicToken: $publicToken) {
				id
				title
				description
				fields {
					${_FORM_FIELD_FIELDS}
				}
			}
		}
	`;

	// PUBLIC - the slug-based counterpart, /<formSlug>/<ownerHandle> (see server/utils/
	// public-form-lookup.js's own header comment). Unlike GET_PUBLIC_FORM above, this ALWAYS
	// resolves to a result - state distinguishes "no such link" from "turned off" from "artist
	// gone" so PublicFormBySlugFillOut.jsx can show the right message instead of one generic dead
	// end.
	const GET_PUBLIC_FORM_BY_SLUG = gql`
		query GetPublicFormBySlug($formSlug: String!, $ownerHandle: String!) {
			getPublicFormBySlug(formSlug: $formSlug, ownerHandle: $ownerHandle) {
				state
				form {
					id
					title
					description
					fields {
						${_FORM_FIELD_FIELDS}
					}
				}
			}
		}
	`;

	// SELF-SCOPED - see server/graphql/resolvers/forms.js's getMyFormLinks for why this is a
	// separate, deliberately narrow query rather than getForms with a scope: a plain
	// shop-connected artist (not shop_admin) has no authority to call getForms(shopId: ...) at
	// all, so this is the only way they can ever see their own shop's published form links.
	const _GET_MY_FORM_LINKS = gql`
		query GetMyFormLinks {
			getMyFormLinks {
				title
				slug
			}
		}
	`;
	const _getMyFormLinks = (options = {}) => useQuery(_GET_MY_FORM_LINKS, options);

	const CREATE_FORM = gql`
		mutation CreateForm($input: CreateFormInput!) {
			createForm(input: $input) {
				${_FORM_FIELDS}
			}
		}
	`;
	const UPDATE_FORM = gql`
		mutation UpdateForm($input: UpdateFormInput!) {
			updateForm(input: $input) {
				${_FORM_FIELDS}
			}
		}
	`;
	const PUBLISH_FORM = gql`
		mutation PublishForm($formId: ID!) {
			publishForm(formId: $formId) {
				${_FORM_FIELDS}
			}
		}
	`;
	const ARCHIVE_FORM = gql`
		mutation ArchiveForm($formId: ID!) {
			archiveForm(formId: $formId) {
				${_FORM_FIELDS}
			}
		}
	`;
	const SET_FORM_GUEST_ACCESS = gql`
		mutation SetFormGuestAccess($formId: ID!, $allow: Boolean!) {
			setFormGuestAccess(formId: $formId, allow: $allow) {
				${_FORM_FIELDS}
			}
		}
	`;
	const DELETE_FORM = gql`
		mutation DeleteForm($formId: ID!) {
			deleteForm(formId: $formId)
		}
	`;

	// The booking_request system form's RESTRICTED editor (task #162) - see server/typeDefs.js's
	// BookingRequestFieldInput comment. $fields is [BookingRequestFieldInput!]!, not
	// [FormFieldInput!] - type/options are never sent from this mutation at all.
	const UPDATE_BOOKING_REQUEST_FIELDS = gql`
		mutation UpdateBookingRequestFields($formId: ID!, $fields: [BookingRequestFieldInput!]!) {
			updateBookingRequestFields(formId: $formId, fields: $fields) {
				${_FORM_FIELDS}
			}
		}
	`;

	const _FORM_RESPONSE_FIELDS = `
		id
		formId
		shopId
		artistUserId
		formTitle
		fieldsSnapshot {
			key
			type
			label
			helpText
			required
			options
		}
		clientId
		client {
			id
			firstName
			lastName
		}
		answers {
			fieldKey
			textValue
			selectedOptions
			dateValue
			fileUrls
			signature {
				signedName
				signedAt
			}
		}
		submittedByUserId
		submittedBy {
			id
			firstName
			lastName
		}
		submitterIp
		source
		createdAt
	`;

	const _FETCH_FORM_RESPONSES = gql`
		query GetFormResponses($formId: ID!, $page: PageInput) {
			getFormResponses(formId: $formId, page: $page) {
				items {
					${_FORM_RESPONSE_FIELDS}
				}
				pageInfo { totalCount hasMore limit offset }
			}
		}
	`;
	const _getFormResponses = (formId, page, options = {}) => {
		return useQuery(_FETCH_FORM_RESPONSES, {
			variables: { formId, page },
			skip: !formId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _FETCH_FORM_RESPONSE = gql`
		query GetFormResponse($formResponseId: ID!) {
			getFormResponse(formResponseId: $formResponseId) {
				${_FORM_RESPONSE_FIELDS}
			}
		}
	`;
	const _getFormResponse = (formResponseId, options = {}) => {
		return useQuery(_FETCH_FORM_RESPONSE, {
			variables: { formResponseId },
			skip: !formResponseId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _FETCH_FORM_ANALYTICS = gql`
		query GetFormAnalytics($formId: ID!) {
			getFormAnalytics(formId: $formId) {
				formId
				totalResponses
				responsesByDay {
					date
					count
				}
				fields {
					fieldKey
					label
					type
					answeredCount
					optionCounts {
						option
						count
					}
				}
			}
		}
	`;
	const _getFormAnalytics = (formId, options = {}) => {
		return useQuery(_FETCH_FORM_ANALYTICS, {
			variables: { formId },
			skip: !formId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	// Not wrapped as a hook - called from both an authenticated context (FormFillOut.jsx) and a
	// public, unauthenticated one (PublicFormFillOut.jsx), each with different loading/error
	// handling around it, the same reason ExpenseService's own mutations are exported raw for
	// useMutation rather than pre-wrapped.
	const SUBMIT_FORM_RESPONSE = gql`
		mutation SubmitFormResponse($input: SubmitFormResponseInput!) {
			submitFormResponse(input: $input) {
				${_FORM_RESPONSE_FIELDS}
			}
		}
	`;

	return {
		getForms: _getForms,
		FETCH_FORMS: _FETCH_FORMS,
		getForm: _getForm,
		FETCH_FORM: _FETCH_FORM,
		GET_PUBLIC_FORM,
		GET_PUBLIC_FORM_BY_SLUG,
		getMyFormLinks: _getMyFormLinks,
		CREATE_FORM,
		UPDATE_FORM,
		PUBLISH_FORM,
		ARCHIVE_FORM,
		SET_FORM_GUEST_ACCESS,
		DELETE_FORM,
		UPDATE_BOOKING_REQUEST_FIELDS,
		getFormResponses: _getFormResponses,
		getFormResponse: _getFormResponse,
		getFormAnalytics: _getFormAnalytics,
		SUBMIT_FORM_RESPONSE,
	};
})();

export default FormService;
