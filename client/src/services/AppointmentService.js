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
                shopCutStatus
                shopCutAmount
                shopCutPaymentMethod
                shopCutSquareInvoiceId
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
                shopCutStatus
                shopCutAmount
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
                shopCutStatus
                shopCutAmount
                shopCutPaymentMethod
                shopCutSquareInvoiceId
            }
        }
    `;

    const _DELETE_APPOINTMENT = gql`
        mutation DeleteAppointment($appointmentId: ID) {
            deleteAppointment(appointmentId: $appointmentId)
            }
    `;

    // --- Shop-cut ledger ---
    // See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. createShopCutInvoice/
    // markShopCutPaidManually are called by the artist (see UpdateEventDialog); confirmShopCutPaid
    // is called by the shop side (see pages/shopCutConfirmations/ShopCutConfirmations.js).
    const _CREATE_SHOP_CUT_INVOICE = gql`
        mutation CreateShopCutInvoice($appointmentId: ID!, $paymentMethod: String) {
            createShopCutInvoice(appointmentId: $appointmentId, paymentMethod: $paymentMethod) {
                invoiceUrl
                appointment {
                    id
                    shopCutStatus
                    shopCutPaymentMethod
                    shopCutSquareInvoiceId
                }
            }
        }
    `;

    const _MARK_SHOP_CUT_PAID_MANUALLY = gql`
        mutation MarkShopCutPaidManually($appointmentId: ID!) {
            markShopCutPaidManually(appointmentId: $appointmentId) {
                id
                shopCutStatus
                shopCutPaymentMethod
                shopCutMarkedPaidAt
            }
        }
    `;

    const _CONFIRM_SHOP_CUT_PAID = gql`
        mutation ConfirmShopCutPaid($appointmentId: ID!) {
            confirmShopCutPaid(appointmentId: $appointmentId) {
                id
                shopCutStatus
                shopCutConfirmedAt
            }
        }
    `;

    const _FETCH_PENDING_SHOP_CUT_CONFIRMATIONS = gql`
        query GetPendingShopCutConfirmations($shopId: ID!) {
            getPendingShopCutConfirmations(shopId: $shopId) {
                id
                appointmentDate
                title
                shopCutAmount
                shopCutMarkedPaidAt
                user {
                    id
                    firstName
                    lastName
                    avatar
                }
            }
        }
    `;
    const _getPendingShopCutConfirmations = (shopId) => {
        return useQuery(_FETCH_PENDING_SHOP_CUT_CONFIRMATIONS, {
            variables: { shopId },
        });
    };

    return {
        FETCH_APPOINTMENTS_BY_SHOP: _FETCH_APPOINTMENTS_BY_SHOP,
        CREATE_APPOINTMENT: _CREATE_APPOINTMENT,
        UPDATE_APPOINTMENT: _UPDATE_APPOINTMENT,
        DELETE_APPOINTMENT: _DELETE_APPOINTMENT,
        CREATE_SHOP_CUT_INVOICE: _CREATE_SHOP_CUT_INVOICE,
        MARK_SHOP_CUT_PAID_MANUALLY: _MARK_SHOP_CUT_PAID_MANUALLY,
        CONFIRM_SHOP_CUT_PAID: _CONFIRM_SHOP_CUT_PAID,
        getAppointmentsByShop: _getAppointmentsByShop,
        getPendingShopCutConfirmations: _getPendingShopCutConfirmations
    }

})();