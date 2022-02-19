import { gql, useQuery, useMutation } from "@apollo/client";

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