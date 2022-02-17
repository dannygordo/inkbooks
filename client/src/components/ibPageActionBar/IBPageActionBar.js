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
        case 'projects':
            return (
                <div className="ibPageActionBarTitleContainer">
                    <h1 className="ibPageActionBarTitle">Projects</h1>
                    <Link to={"/projects/createProject"}>
                        <button>Add Project</button>
                    </Link>
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