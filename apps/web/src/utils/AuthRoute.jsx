import React, {useContext} from 'react';
import {useLocation, Navigate} from 'react-router-dom';
import {AuthContext} from '../context/auth';

function AuthRoute({children}){
    const { user, initializing } = useContext(AuthContext);
    let location = useLocation();

    // The stored session is now read asynchronously (TokenStorageService.getItemAsync - see
    // context/auth.jsx) - on the very first render after a hard refresh, `user` is still null even
    // for someone who IS signed in, simply because that read hasn't resolved yet. Redirecting on
    // that render would bounce an already-authenticated person to /login before AuthProvider's own
    // effect had a chance to restore them. Rendering nothing until `initializing` flips false closes
    // that window; it stays false for the rest of the tab's life afterward, so this only ever
    // matters once, on load. `initializing` is undefined (falsy) for any test/consumer that
    // constructs AuthContext.Provider's value by hand without it, so this doesn't change behavior
    // anywhere that isn't going through the real AuthProvider.
    if (initializing) {
        return null;
    }

    if (!user) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to when they were redirected. This allows us to send them
        // along to that page after they login, which is a nicer user experience
        // than dropping them off on the home page.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}

export default AuthRoute;
