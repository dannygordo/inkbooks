module.exports.Constants = {
    ROLES: {
        ADMIN: 1,
        SHOP_ADMIN: 10,
        SHOP_STAFF: 15,
        ARTIST: 20,
        CLIENT: 30
    },
    ARTIST_STATUS: {
        ACTIVE: 1,
        INACTIVE: 2,
        BOOKS_CLOSED: 3
    },
    PROJECT_STATUS: {
        COMPLETED: 1,
        IN_PROGRESS: 2,
        ABANDONDED: 3
    },
    USER_TYPE: {
        ARTIST: 'artist',
        CLIENT: 'client',
        STAFF: 'staff'
    },
    ERRORS: {
        AUTHENTICATION_ERROR: 'You are not authorized to perform this action'
    },
    URLS: {
        INKBOOKS_WEBAPP: 'http://localhost:3000',

    }
};