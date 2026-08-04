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

	const _fetchStaff = () => {
		const FETCH_STAFF_QUERY = gql`
			{
				getStaff {
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
			}
		`;
		return useQuery(FETCH_STAFF_QUERY);
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

	return {
		fetchOneStaff: _fetchOneStaff,
		fetchStaff: _fetchStaff,
        updateStaff: _updateStaff
	};
})();

export default StaffService