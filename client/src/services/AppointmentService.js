import { gql, useQuery } from "@apollo/client";

export const AppointmentService = (() => {
    const _FETCH_APPOINTMENTS_BY_SHOP = gql`
        query GetAppointmentsByShop($shopId: ID!) {
            getAppointmentsByShop(shopId: $shopId) {
                id
                projectId
                userId
                project {
                    id
                    client {
                        id
                        user {
                            id
                            firstName
                            lastName
                            avatar
                        }
                    }
                    depositAmount
                }
                shopId
                user {
                    id
                    tagColor
                    lastName
                    firstName
                    avatar
                }
                title
                description
                appointmentType
                appointmentDate
            }
        }
    `;
    const _getAppointmentsByShop = (shopId) => {
        return useQuery(_FETCH_APPOINTMENTS_BY_SHOP, {
			variables: {
				shopId,
			},
		});
    }

    const _CREATE_APPOINTMENT = gql`
        mutation CreateAppointment($appointmentInput: AppointmentInput) {
            createAppointment(appointmentInput: $appointmentInput) {
                projectId
                userId
                project {
                    id
                    designImages {
                        url
                    }
                }
                shopId
                user {
                    id
                    firstName
                    lastName
                    tagColor
                }
                title
                description
                appointmentType
                id
                appointmentDate
            }
        }
    `;

    const _UPDATE_APPOINTMENT = gql`
        mutation UpdateAppointment($appointmentInput: AppointmentInput) {
            updateAppointment(appointmentInput: $appointmentInput) {
                projectId
                project {
                    designImages {
                        url
                    }
                }
                shopId
                user {
                    id
                    firstName
                    lastName
                    tagColor
                }
                title
                description
                appointmentType
                id
                appointmentDate
            }
        }
    `;

    const _DELETE_APPOINTMENT = gql`
        mutation DeleteAppointment($appointmentId: ID) {
            deleteAppointment(appointmentId: $appointmentId)
            }
    `;

    return {
        FETCH_APPOINTMENTS_BY_SHOP: _FETCH_APPOINTMENTS_BY_SHOP,
        CREATE_APPOINTMENT: _CREATE_APPOINTMENT,
        UPDATE_APPOINTMENT: _UPDATE_APPOINTMENT,
        DELETE_APPOINTMENT: _DELETE_APPOINTMENT,
        getAppointmentsByShop: _getAppointmentsByShop
    }

})();