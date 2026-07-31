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
        // Was hardcoded to localhost:3000 in every environment - harmless while this was only
        // used to scope the socket.io CORS origin (nothing enforced it in production), but now
        // that Express/Apollo's CORS also uses this value, a production deploy needs the real
        // production origin here or every browser request gets blocked by CORS.
        INKBOOKS_WEBAPP: process.env.NODE_ENV === 'PRODUCTION' ? 'http://www.inkbooks.net' : 'http://localhost:3000',
    }
};