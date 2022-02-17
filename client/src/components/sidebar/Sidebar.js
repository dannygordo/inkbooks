import './sidebar.css';
import { useContext } from 'react';
import {
    AccountBoxSharp,
    Assessment,
    Build,
    Dashboard,
    DateRange,
    House,
    Palette, Payment,
    Person,
    Badge
} from '@mui/icons-material';
import {Link, Navigate} from 'react-router-dom';
import { AuthContext } from '../../context/auth';


const Sidebar = () => {
    const { user } = useContext(AuthContext);
    //prevents topbar from rendering if the user is not authenticated
    if(!user){
        return (<></>);
    }
    return(
        <div className="sidebar">
            <div className="sidebarWrapper">
                <div className="sidebarMenu">
                    <h3 className="sidebarTitle">Quick Links</h3>
                    <ul className="sidebarList">
                        <li className="sidebarListItem">
                            <Dashboard className="sidebarIcon"/>
                            <Link to="/">Dashboard</Link>
                        </li>
                        <li className="sidebarListItem">
                            <DateRange className="sidebarIcon"/>
                            <Link to="/appointments">Appointments</Link>
                        </li>
                        <li className="sidebarListItem">
                            <Palette className="sidebarIcon"/>
                            <Link to="/artists">Artists</Link>
                        </li>
                        <li className="sidebarListItem">
                            <Badge className="sidebarIcon"/>
                            <Link to="/staff">Staff</Link>
                        </li>
                        <li className="sidebarListItem">
                            <Person className="sidebarIcon"/>
                            <Link to="/clients">Clients </Link>
                        </li>
                        <li className="sidebarListItem">
                            <Build className="sidebarIcon"/>
                            <Link to="/projects">Projects</Link>
                        </li>
                        <li className="sidebarListItem">
                            <Assessment className="sidebarIcon"/>
                            <Link to="/reports">Reports</Link>
                        </li>
                    </ul>
                    <h3 className="sidebarTitle">Settings</h3>
                    <ul className="sidebarList">
                        <li className="sidebarListItem">
                            <AccountBoxSharp className="sidebarIcon"/>
                            <Link to="/account">Account</Link>
                        </li>
                        <li className="sidebarListItem">
                            <House className="sidebarIcon"/>
                            <Link to="/shops">Shops</Link>
                        </li>
                        <li className="sidebarListItem">
                            <Palette className="sidebarIcon"/>
                            <Link to="/portfolio">Portfolio</Link>
                        </li>
                        <li className="sidebarListItem">
                            <Payment className="sidebarIcon"/>
                            <Link to="/payments">Payments</Link>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
export default Sidebar;