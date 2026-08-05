import { gql, useQuery } from "@apollo/client";

const StaffService = (() => {
    const _fetchOneStaff = (staffId) => {
		const FETCH_ONE_STAFF_QUERY = gql`
			query ($staffId: ID!) {
				getOneStaff(staffId: $staffId) {
					id
					firstName
					lastName
					email
					phone
					address
					city
					state
					zip
					instagram
					facebook
					avatar
					userId
                    title
                    status
                    shopId
				}
			}
		`;
		return useQuery(FETCH_ONE_STAFF_QUERY, {
			variables: {
				staffId,
			},
		});
	};

	// See ArtistService's matching comment on includeArchived.
	const _fetchStaff = (includeArchived = false, page) => {
		const FETCH_STAFF_QUERY = gql`
			query GetStaff($includeArchived: Boolean, $page: PageInput) {
				getStaff(includeArchived: $includeArchived, page: $page) {
					items {
						id
						firstName
						lastName
						email
						phone
						address
						city
						state
						zip
						instagram
						facebook
						avatar
						userId
	                    title
	                    status
	                    shopId
						# Was a bare "user". That's an object type and can't be selected without
						# subfields, so GraphQL rejects the whole document - meaning this query has
						# never executed at all and the Staff list has always failed with "Field user
						# of type User must have a selection of subfields". Found by validating every
						# gql document in this app against the real server schema; unrelated to the
						# work that surfaced it.
						user {
							id
							firstName
							lastName
							avatar
						}
					}
					pageInfo { totalCount hasMore limit offset }
				}
			}
		`;
		return useQuery(FETCH_STAFF_QUERY, { variables: { includeArchived, page } });
	};

	const _updateStaff = (staff) => {
		const UPDATE_STAFF_MUTATION = gql`
			mutation ($staff: StaffInput) {
				updateStaff(staff: $staff) {
					id
					firstName
					lastName
					email
					phone
					address
					city
					state
					zip
					instagram
					facebook
					avatar
					userId
                    title
                    status
                    shopId
				}
			}
		`;
        return UPDATE_STAFF_MUTATION;
	};

	const _ARCHIVE_STAFF_MUTATION = gql`
		mutation ArchiveStaff($staffId: ID!) {
			archiveStaff(staffId: $staffId) { id status }
		}
	`;
	const _UNARCHIVE_STAFF_MUTATION = gql`
		mutation UnarchiveStaff($staffId: ID!) {
			unarchiveStaff(staffId: $staffId) { id status }
		}
	`;

	return {
		fetchOneStaff: _fetchOneStaff,
		fetchStaff: _fetchStaff,
        updateStaff: _updateStaff,
		ARCHIVE_STAFF_MUTATION: _ARCHIVE_STAFF_MUTATION,
		UNARCHIVE_STAFF_MUTATION: _UNARCHIVE_STAFF_MUTATION,
	};
})();

export default StaffService