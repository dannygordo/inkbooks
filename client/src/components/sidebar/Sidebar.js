import React, { useContext, useState } from "react";
import { styled, useTheme, alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import MuiDrawer from "@mui/material/Drawer";
import MuiAppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import List from "@mui/material/List";
import CssBaseline from "@mui/material/CssBaseline";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import InboxIcon from "@mui/icons-material/MoveToInbox";
import MailIcon from "@mui/icons-material/Mail";
import { AuthContext } from "../../context/auth";
import { APP_SETTINGS_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";
import InputBase from "@mui/material/InputBase";
import { useNavigate } from "react-router-dom";
import IBAvatar from "../inputs/IBAvatar";
import {
	AccountBox,
	AccountCircle,
	Assessment,
	Build,
	Dashboard,
	DateRange,
	House,
	Message,
	Palette,
	People,
	Person,
	Settings,
} from "@mui/icons-material";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import PersonAdd from "@mui/icons-material/PersonAdd";
import Logout from "@mui/icons-material/Logout";

import SearchIcon from "@mui/icons-material/Search";
import { Badge, Fab } from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";

const Search = styled("div")(({ theme }) => ({
	position: "relative",
	borderRadius: theme.shape.borderRadius,
	backgroundColor: alpha(theme.palette.common.black, 0.15),
	"&:hover": {
		backgroundColor: alpha(theme.palette.common.black, 0.25),
	},
	marginRight: theme.spacing(2),
	marginLeft: 0,
	width: "100%",
	[theme.breakpoints.up("sm")]: {
		marginLeft: theme.spacing(3),
		width: "auto",
	},
}));

const handleSearch = (e) => {
	e.preventDefault();
	console.log(e.target.value);
};

const SearchIconWrapper = styled("div")(({ theme }) => ({
	padding: theme.spacing(0, 2),
	height: "100%",
	position: "absolute",
	pointerEvents: "none",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
	color: "inherit",
	"& .MuiInputBase-input": {
		padding: theme.spacing(1, 1, 1, 0),
		// vertical padding + font size from searchIcon
		paddingLeft: `calc(1em + ${theme.spacing(4)})`,
		transition: theme.transitions.create("width"),
		width: "100%",
		[theme.breakpoints.up("md")]: {
			width: "20ch",
		},
	},
}));

const drawerWidth = 240;

const openedMixin = (theme) => ({
	width: drawerWidth,
	transition: theme.transitions.create("width", {
		easing: theme.transitions.easing.sharp,
		duration: theme.transitions.duration.enteringScreen,
	}),
	overflowX: "hidden",
});

const closedMixin = (theme) => ({
	transition: theme.transitions.create("width", {
		easing: theme.transitions.easing.sharp,
		duration: theme.transitions.duration.leavingScreen,
	}),
	overflowX: "hidden",
	width: `calc(${theme.spacing(7)} + 1px)`,
	[theme.breakpoints.up("sm")]: {
		width: `calc(${theme.spacing(8)} + 1px)`,
	},
});

const DrawerHeader = styled("div")(({ theme }) => ({
	display: "flex",
	alignItems: "center",
	alignContent: "space-between",
	justifyContent: "space-between",
	marginLeft: 10,
	padding: theme.spacing(0, 1),
	// necessary for content to be below app bar
	...theme.mixins.toolbar,
}));

const AppBar = styled(MuiAppBar, {
	shouldForwardProp: (prop) => prop !== "open",
})(({ theme, open }) => ({
	zIndex: theme.zIndex.drawer + 1,
	transition: theme.transitions.create(["width", "margin"], {
		easing: theme.transitions.easing.sharp,
		duration: theme.transitions.duration.leavingScreen,
	}),
	...(open && {
		marginLeft: drawerWidth,
		display: "flex",
		alignItems: "flex-end",
		justifyContent: "space-between",
		backgroundColor: "#ffffff",
		width: `calc(100% - ${drawerWidth}px)`,
		transition: theme.transitions.create(["width", "margin"], {
			easing: theme.transitions.easing.sharp,
			duration: theme.transitions.duration.enteringScreen,
		}),
	}),
}));

const Drawer = styled(MuiDrawer, {
	shouldForwardProp: (prop) => prop !== "open",
})(({ theme, open }) => ({
	width: drawerWidth,
	flexShrink: 0,
	whiteSpace: "nowrap",
	boxSizing: "border-box",
	...(open && {
		...openedMixin(theme),
		"& .MuiDrawer-paper": openedMixin(theme),
	}),
	...(!open && {
		...closedMixin(theme),
		"& .MuiDrawer-paper": closedMixin(theme),
	}),
}));

export default function Sidebar() {
	const theme = useTheme();
	const [open, setOpen] = useState(true);

	const [searchEnabled, setSearchEnabled] = useState(true);

	const { user, logout } = useContext(AuthContext);
	let navigate = useNavigate();
	const [anchorEl, setAnchorEl] = useState(null);
	const openProfile = Boolean(anchorEl);

	const handleClick = (event) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleProfileClick = () => {
		navigate(ROUTE_CONSTANTS.PROFILE);
	};

	const handleLogout = (e) => {
		logout();
		navigate(ROUTE_CONSTANTS.HOME);
	};

	const handleDrawerOpen = () => {
		setOpen(true);
	};

	const handleDrawerClose = () => {
		setOpen(false);
	};

	const handleMobileMenuOpen = (event) => {
		setMobileMoreAnchorEl(event.currentTarget);
	};

	const [mobileMoreAnchorEl, setMobileMoreAnchorEl] = useState(null);

	const isMenuOpen = Boolean(anchorEl);
	const isMobileMenuOpen = Boolean(mobileMoreAnchorEl);

	const handleProfileMenuOpen = (event) => {
		setAnchorEl(event.currentTarget);
	};

	const handleMobileMenuClose = () => {
		setMobileMoreAnchorEl(null);
	};

	const handleMenuClose = () => {
		setAnchorEl(null);
		handleMobileMenuClose();
	};

	const mobileMenuId = "primary-search-account-menu-mobile";
	const renderMobileMenu = (
		<Menu
			anchorEl={mobileMoreAnchorEl}
			anchorOrigin={{
				vertical: "top",
				horizontal: "right",
			}}
			id={mobileMenuId}
			keepMounted
			transformOrigin={{
				vertical: "top",
				horizontal: "right",
			}}
			open={isMobileMenuOpen}
			onClose={handleMobileMenuClose}
		>
			<MenuItem>
				<IconButton
					size="large"
					aria-label="show 4 new mails"
					color="inherit"
				>
					<Badge badgeContent={4} color="error">
						<MailIcon />
					</Badge>
				</IconButton>
				<p>Messages</p>
			</MenuItem>
			<MenuItem>
				<IconButton
					size="large"
					aria-label="show 17 new notifications"
					color="inherit"
				>
					<Badge badgeContent={17} color="error">
						<NotificationsIcon />
					</Badge>
				</IconButton>
				<p>Notifications</p>
			</MenuItem>
			<MenuItem onClick={handleProfileMenuOpen}>
				<IconButton
					size="large"
					aria-label="account of current user"
					aria-controls="primary-search-account-menu"
					aria-haspopup="true"
					color="inherit"
				>
					<AccountCircle />
				</IconButton>
				<p>Profile</p>
			</MenuItem>
		</Menu>
	);

	const [selectedIndex, setSelectedIndex] = useState(0);

	const handleListItemClick = (event, index, path) => {
		console.log(event);
		//const path = event.target.innerText.toLowerCase();
		setSelectedIndex(index);
		navigate(`/${path}`);
	};

	return (
		<Box sx={{ display: "flex" }}>
			<CssBaseline />
			<AppBar position="fixed" open={open}>
				<Toolbar
					sx={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						backgroundColor: "#ffffff",
					}}
				>
					<IconButton
						color="primary"
						aria-label="open drawer"
						onClick={handleDrawerOpen}
						edge="start"
						sx={{
							marginRight: 5,
							...(open && { display: "none" }),
						}}
					>
						<MenuIcon />
					</IconButton>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							textAlign: "center",
						}}
					>
						{searchEnabled && (
							<Search>
								<SearchIconWrapper>
									<SearchIcon />
								</SearchIconWrapper>
								<StyledInputBase
									placeholder="Search…"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleSearch(e, e.target.value);
										}
									}}
									inputProps={{ "aria-label": "search" }}
								/>
							</Search>
						)}
						<Box sx={{ flexGrow: 1 }} />
						<Box sx={{ display: { xs: "none", md: "flex" } }}>
							<Fab
								size="medium"
								aria-label="show 4 new mails"
								sx={{
									backgroundColor: "#ddd",
									color: "#333",
									"&:hover": {
										color: "#ddd",
										backgroundColor: "#333",
									},
								}}
							>
								<Badge badgeContent={4} color="error">
									<MailIcon />
								</Badge>
							</Fab>
							<Fab
								sx={{
									marginLeft: "5px",
									backgroundColor: "#ddd",
									color: "#333",
									"&:hover": {
										color: "#ddd",
										backgroundColor: "#333",
									},
								}}
								size="medium"
								aria-label="show 17 new notifications"
							>
								<Badge badgeContent={17} color="error">
									<NotificationsIcon />
								</Badge>
							</Fab>
						</Box>
						<Tooltip title="Account settings">
							<IconButton
								onClick={handleClick}
								size="small"
								sx={{ ml: 2 }}
								aria-controls={
									open ? "account-menu" : undefined
								}
								aria-haspopup="true"
								aria-expanded={open ? "true" : undefined}
							>
								<IBAvatar
									size={48}
									cursor="pointer"
									imgUrl={user.avatar}
									label={`${user.firstName} ${user.lastName}`}
								/>
							</IconButton>
						</Tooltip>
					</Box>
					<Menu
						anchorEl={anchorEl}
						id="account-menu"
						open={openProfile}
						onClose={handleClose}
						onClick={handleClose}
						PaperProps={{
							elevation: 0,
							sx: {
								overflow: "visible",
								filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.32))",
								mt: 1.5,
								"& .MuiAvatar-root": {
									width: 32,
									height: 32,
									ml: -0.5,
									mr: 1,
								},
								"&:before": {
									content: '""',
									display: "block",
									position: "absolute",
									top: 0,
									right: 14,
									width: 10,
									height: 10,
									bgcolor: "background.paper",
									transform: "translateY(-50%) rotate(45deg)",
									zIndex: 0,
								},
							},
						}}
						transformOrigin={{
							horizontal: "right",
							vertical: "top",
						}}
						anchorOrigin={{
							horizontal: "right",
							vertical: "bottom",
						}}
					>
						<MenuItem onClick={handleProfileClick}>
							<IBAvatar
								size={50}
								cursor="pointer"
								imgUrl={user.avatar}
								label={`${user.firstName} ${user.lastName}`}
							/>{" "}
							Profile
						</MenuItem>
						<MenuItem>
							<Avatar /> My account
						</MenuItem>
						<Divider />
						<MenuItem>
							<ListItemIcon>
								<PersonAdd fontSize="small" />
							</ListItemIcon>
							Add another account
						</MenuItem>
						<MenuItem>
							<ListItemIcon>
								<Settings fontSize="small" />
							</ListItemIcon>
							Settings
						</MenuItem>
						<MenuItem onClick={handleLogout}>
							<ListItemIcon>
								<Logout fontSize="small" />
							</ListItemIcon>
							Logout
						</MenuItem>
					</Menu>
				</Toolbar>
			</AppBar>
			{renderMobileMenu}
			<Drawer variant="permanent" open={open}>
				<DrawerHeader>
					{open ? <div className="logo">Inkbooks</div> : <></>}
					<IconButton onClick={handleDrawerClose}>
						{theme.direction === "rtl" ? (
							<ChevronRightIcon />
						) : (
							<ChevronLeftIcon />
						)}
					</IconButton>
				</DrawerHeader>
				<Divider />
				<List>
					<ListItemButton
						selected={selectedIndex === 0}
						onClick={(event) =>
							handleListItemClick(event, 0, "dashboard")
						}
						key="Dashboard"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							key="Dashboard"
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<Dashboard />
						</ListItemIcon>
						<ListItemText
							primary="Dashboard"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
					<ListItemButton
						selected={selectedIndex === 1}
						onClick={(event) =>
							handleListItemClick(event, 1, "appointments")
						}
						key="Appointments"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<DateRange />
						</ListItemIcon>
						<ListItemText
							primary="Appointments"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
					<ListItemButton
						selected={selectedIndex === 2}
						onClick={(event) =>
							handleListItemClick(event, 2, "artists")
						}
						key="Artists"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<Palette />
						</ListItemIcon>
						<ListItemText
							primary="Artists"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
					<ListItemButton
						selected={selectedIndex === 3}
						onClick={(event) =>
							handleListItemClick(event, 3, "staff")
						}
						key="Staff"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<People />
						</ListItemIcon>
						<ListItemText
							primary="Staff"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
					<ListItemButton
						selected={selectedIndex === 4}
						onClick={(event) =>
							handleListItemClick(event, 4, "clients")
						}
						key="Clients"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<AccountBox />
						</ListItemIcon>
						<ListItemText
							primary="Clients"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
					<ListItemButton
						selected={selectedIndex === 5}
						onClick={(event) =>
							handleListItemClick(event, 5, "projects")
						}
						key="Projects"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<Build />
						</ListItemIcon>
						<ListItemText
							primary="Projects"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
					<ListItemButton
						selected={selectedIndex === 6}
						onClick={(event) =>
							handleListItemClick(event, 6, "reports")
						}
						key="Reports"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<Assessment />
						</ListItemIcon>
						<ListItemText
							primary="Reports"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
					<ListItemButton
						selected={selectedIndex === 7}
						onClick={(event) =>
							handleListItemClick(event, 7, "messenger")
						}
						key="Messenger"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<Message />
						</ListItemIcon>
						<ListItemText
							primary="Messenger"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
				</List>
				<Divider />
				<List>
					<ListItemButton
						selected={selectedIndex === 8}
						onClick={(event) =>
							handleListItemClick(event, 8, "shops")
						}
						key="Shops"
						sx={{
							minHeight: 48,
							justifyContent: open ? "initial" : "center",
							px: 2.5,
						}}
					>
						<ListItemIcon
							sx={{
								minWidth: 0,
								mr: open ? 3 : "auto",
								justifyContent: "center",
							}}
						>
							<House />
						</ListItemIcon>
						<ListItemText
							primary="Shops"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
				</List>
				{/* <List>
					{["All mail", "Trash", "Spam"].map((text, index) => (
						<ListItemButton
							key={text}
							sx={{
								minHeight: 48,
								justifyContent: open ? "initial" : "center",
								px: 2.5,
							}}
                            onClick={(e) => navigate(ROUTE_CONSTANTS.HOME)}
						>
							<ListItemIcon
								sx={{
									minWidth: 0,
									mr: open ? 3 : "auto",
									justifyContent: "center",
								}}
							>
								{index % 2 === 0 ? <InboxIcon /> : <MailIcon />}
							</ListItemIcon>
							<ListItemText
								primary={text}
								sx={{ opacity: open ? 1 : 0 }}
							/>
						</ListItemButton>
					))}
				</List> */}
			</Drawer>
		</Box>
	);
}

// import './sidebar.css';
// import { useContext } from 'react';
// import {
//     AccountBoxSharp,
//     Assessment,
//     Build,
//     Dashboard,
//     DateRange,
//     House,
//     Palette, Payment,
//     Person,
//     Badge,
//     Message
// } from '@mui/icons-material';
// import {Link, Navigate} from 'react-router-dom';
// import { AuthContext } from '../../context/auth';

// const Sidebar = () => {
//     const { user } = useContext(AuthContext);
//     //prevents topbar from rendering if the user is not authenticated
//     if(!user){
//         return (<></>);
//     }
//     return(
//         <div className="sidebar">
//             <div className="sidebarWrapper">
//                 <div className="sidebarMenu">
//                     <h3 className="sidebarTitle">Quick Links</h3>
//                     <ul className="sidebarList">
//                         <li className="sidebarListItem">
//                             <Dashboard className="sidebarIcon"/>
//                             <Link to="/">Dashboard</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <DateRange className="sidebarIcon"/>
//                             <Link to="/appointments">Appointments</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <Palette className="sidebarIcon"/>
//                             <Link to="/artists">Artists</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <Badge className="sidebarIcon"/>
//                             <Link to="/staff">Staff</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <Person className="sidebarIcon"/>
//                             <Link to="/clients">Clients </Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <Build className="sidebarIcon"/>
//                             <Link to="/projects">Projects</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <Assessment className="sidebarIcon"/>
//                             <Link to="/reports">Reports</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <Message className="sidebarIcon"/>
//                             <Link to="/messenger">Messenger</Link>
//                         </li>
//                     </ul>
//                     <h3 className="sidebarTitle">Settings</h3>
//                     <ul className="sidebarList">
//                         <li className="sidebarListItem">
//                             <AccountBoxSharp className="sidebarIcon"/>
//                             <Link to="/account">Account</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <House className="sidebarIcon"/>
//                             <Link to="/shops">Shops</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <Palette className="sidebarIcon"/>
//                             <Link to="/portfolio">Portfolio</Link>
//                         </li>
//                         <li className="sidebarListItem">
//                             <Payment className="sidebarIcon"/>
//                             <Link to="/payments">Payments</Link>
//                         </li>
//                     </ul>
//                 </div>
//             </div>
//         </div>
//     )
// }
// export default Sidebar;
