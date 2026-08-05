module.exports.Constants = {
    ROLES: {
        // Reserved, and deliberately powerless. ADMIN was a global role that could read every
        // shop on the platform; that bypass is gone (see utils/shop-membership.js) and nothing
        // grants cross-shop access any more. The number is kept rather than deleted so an
        // existing role-1 row doesn't silently become some other role - it degrades to an
        // account with no shop, which sees nothing. Don't build new features on it.
        ADMIN: 1,
        // The real ceiling. Full access to everything at THEIR OWN shop, money included.
        SHOP_ADMIN: 10,
        SHOP_STAFF: 15,
        ARTIST: 20,
        CLIENT: 30
    },
    // ARCHIVED is what "delete this person" now means - see the note on the Mutation type in
    // graphql/typeDefs.js for why the delete* mutations went away. It is deliberately NOT the same
    // as INACTIVE: an inactive artist is still at the shop and might come back next week, an
    // archived one is off the roster and out of every picker. Archiving never touches history -
    // their completed appointments still count toward shop revenue and still render on the
    // calendar in their own colour, because the money changed hands and revenue that moves when
    // you archive somebody is worse than useless.
    ARTIST_STATUS: {
        ACTIVE: 1,
        INACTIVE: 2,
        BOOKS_CLOSED: 3,
        ARCHIVED: 4
    },
    // Staff.status has always been a bare required Number with no named values (see
    // models/Staff.js) - 1 was just "some valid number" everywhere it was written. These name the
    // two that now actually mean something; anything else stays legal and reads as active.
    STAFF_STATUS: {
        ACTIVE: 1,
        ARCHIVED: 4
    },
    // Client had no status field at all until archiving needed one. Same two values, same
    // numbering as the other two, so "4 means archived" is one fact rather than three.
    CLIENT_STATUS: {
        ACTIVE: 1,
        ARCHIVED: 4
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
        // Must be https in production - Netlify serves the frontend over https. This was
        // previously set to 'https://www.inkbooks.net', but Netlify's Domain management confirms
        // inkbooks.net (no www) is the Primary domain - www.inkbooks.net redirects to it, not the
        // other way around - so the browser's real Origin header on every request is
        // https://inkbooks.net. That www/non-www mismatch made cors() reject every single
        // GraphQL/socket.io request from the live production frontend (confirmed live: a fetch()
        // from https://inkbooks.net to the API failed with "Failed to fetch", the CORS-block
        // signature). cors() and socket.io's cors option both do exact string matching, so any
        // mismatch here (http vs https, www vs non-www) breaks production entirely.
        INKBOOKS_WEBAPP: process.env.NODE_ENV === 'PRODUCTION' ? 'https://inkbooks.net' : 'http://localhost:3000',
    }
};