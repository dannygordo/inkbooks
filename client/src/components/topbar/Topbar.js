import React, { useContext } from 'react';
import "./topbar.css";
import {NotificationsNone, Language, Settings} from '@mui/icons-material';
import { AuthContext } from '../../context/auth';
import { useNavigate } from 'react-router-dom';

const Topbar = () => {
    const { user, logout } = useContext(AuthContext);
    let navigate = useNavigate();
    
    const handleLogout = (e) => {
        logout();
        navigate('/');
    }
    //prevents topbar from rendering if the user is not authenticated
    if(!user){
        return (<></>);
    }
    return (
        <div className="topbar">
            <div className="topbarWrapper">
                <div className="topLeft">
                    <span className="logo">Inkbooks</span>
                </div>
                <div className="topRight">
                    <div className="topbarIconContainer">
                        <NotificationsNone />
                        <span className="topIconBadge">2</span>
                    </div>
                    <div className="topbarIconContainer">
                        <Language />
                        <span className="topIconBadge">2</span>
                    </div>
                    <div className="topbarIconContainer">
                        <Settings />
                        <span className="topIconBadge">2</span>
                    </div>
                    {/* <div className="topbarIconContainer">
                        <span onClick={handleLogout}>Logout</span>
                    </div> */}
                    <span onClick={handleLogout}>
                        <img src={user.userInfo.avatar} alt="" className="topAvatar" />
                        {user.firstName}
                    </span>
                </div>
            </div>
        </div>
    )
}

export default Topbar;