import React from 'react'
import './ibPageActionBar.css';
import { useAuth } from '../../context/auth';
import { ROLES } from '../../constants/auth';
import {
    CreateArtistWizard,
    CreateClientWizard,
    CreateStaffWizard,
} from '../wizards/AccountWizards';

/**
 * Page heading plus the "Add" action for each directory.
 *
 * Every one of these buttons used to be a <Link> to a route that has never existed in App.jsx -
 * /artist, /clients/createClient, /shops/createShop, /staff/createStaff. Three of the four
 * matching create/ component directories were empty. So none of them worked, and creating a
 * client, artist or staff member was impossible through the UI.
 *
 * They now open a wizard in the global modal, matching AppointmentWizard - the one creation flow
 * in this app that already worked - rather than navigating to a page.
 *
 * @param {() => void} onCreated - lets the list refetch after a create, so the new record appears
 *   without a reload.
 */
const IBPageActionBar = ({ pageType, onCreated }) => {
    const { user, setModal, modal } = useAuth();

    const closeModal = () => setModal({ ...modal, isOpen: false });

    const openWizard = (title, Wizard) => () => {
        setModal({
            isOpen: true,
            title,
            content: <Wizard onClose={closeModal} onCreated={onCreated} />,
        });
    };

    // Creating an artist or staff member is a shop-admin action - it creates a login and, for
    // staff, decides what someone can see. Adding a client is front-desk work, so it's open to
    // Staff and above. Both mirror the server's own gate (see mutations/accounts.js); this only
    // decides whether to offer the button, and hiding it is not the boundary.
    const canManageAccounts = user?.role <= ROLES.SHOP_ADMIN;
    const canAddClients = user?.role <= ROLES.STAFF;

    switch(pageType) {
        case 'artists':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Artists</h1>
                    {canManageAccounts && (
                        <button onClick={openWizard('Add Artist', CreateArtistWizard)}>
                            Add Artist
                        </button>
                    )}
                </div>
                );
        case 'clients':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Clients</h1>
                    {canAddClients && (
                        <button onClick={openWizard('Add Client', CreateClientWizard)}>
                            Add Client
                        </button>
                    )}
                </div>
                );
        // No "Add Project" button, deliberately. A project isn't created directly - it's spawned
        // by the booking workflow (a booking request becomes a consult, a consult converts to a
        // session, and convertBookingRequest creates the Project from the request's own intake
        // fields - see server/graphql/mutations/bookingRequests.js). A project with no client and
        // no booked work has nothing to be about, which is why there's no independent create path
        // to offer. The button that used to be here linked to /projects/createProject, a route
        // that has never existed in App.jsx.
        case 'projects':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Projects</h1>
                </div>
                );
        // No "Add Shop" button either, but for a different reason than projects: a shop-creation
        // wizard wasn't in scope here, and the link that used to be here (/shops/createShop) was
        // just as dead as the rest. Left off rather than left broken - a button that does nothing
        // is worse than an absent one, because it costs someone a click and a moment of doubt
        // about whether they did it wrong.
        case 'shops':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Shops</h1>
                </div>
                );
        case 'staff':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Staff</h1>
                    {canManageAccounts && (
                        <button onClick={openWizard('Add Staff Member', CreateStaffWizard)}>
                            Add Staff
                        </button>
                    )}
                </div>
                );
        default:
            return(
                <div>
                    Unknown page type
                </div>
            )
    }

}

export default IBPageActionBar
