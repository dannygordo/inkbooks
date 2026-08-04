import React from 'react'
import { Link } from 'react-router-dom';
import './ibPageActionBar.css';

const IBPageActionBar = (props) => {
    const { pageType } = props;

    switch(pageType) {
        case 'artists':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Artists</h1> 
                    <Link to={"/artist"}>
                        <button>Add Artist</button>
                    </Link>
                </div>
                );
        case 'clients':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Clients</h1>
                    <Link to={"/clients/createClient"}>
                        <button>Add Client</button>
                    </Link>
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
        case 'shops':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Shops</h1>
                    <Link to={"/shops/createShop"}>
                        <button>Add Shop</button>
                    </Link>
                </div>
                );
        case 'staff':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Staff</h1>
                    <Link to={"/staff/createStaff"}>
                        <button>Add Staff</button>
                    </Link>
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