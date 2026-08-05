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
import PriceCheckIcon from "@mui/icons-material/PriceCheck";
import SettingsIcon from "@mui/icons-material/Settings";
import { AuthContext } from "../../context/auth";
import { APP_SETTINGS_CONSTANTS, ROUTE_CONSTANTS, ROLES, roleLabel } from "../../constants";
import InputBase from "@mui/material/InputBase";
import { useNavigate } from "react-router-dom";
import IBAvatar from "../inputs/IBAvatar";
import MessengerService from "../../services/MessengerService";
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
} from "@mui/icons-material";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
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

	// Nav-item visibility by role/userType. This is UI-only - it hides items a given user has no
	// real reason to click, it does NOT replace server-side authorization. Several of the
	// underlying queries these items link to (getShops, getStaff, getClients, getArtists,
	// getProjects, getConversations*) still have no ownership/role check beyond "logged in" -
	// unlike getAppointmentsByArtist/getAppointmentsByShop/getProjectsByArtist, which were just
	// locked down (see resolvers/appointments.js, resolvers/projects.js). A Client hitting those
	// other queries directly through the API, or typing the route URL, would still get the data.
	// Hiding the nav entry is a real UX improvement but not a security fix - flagging this
	// distinction rather than letting "no visible link" read as "actually restricted".
	const isShopAdminOrBetter = user.role <= ROLES.SHOP_ADMIN;
	const isStaffOrBetter = user.role <= ROLES.SHOP_STAFF;
	const isClient = user.userType === "client";
	// Settings currently only has real content for an artist (rate config - see pages/settings/
	// Settings.jsx) - hidden for everyone else rather than linking to a page that just says
	// "nothing to configure here yet".
	const isArtistUser = user.userType === "artist";
	// Unread messages, for the badge on Messenger below. Polled as well as refetched: a message
	// arriving from someone else is not something this tab does, so there is nothing local to
	// trigger a refresh off. Sixty seconds is slow enough to be free and fast enough that an
	// artist who leaves the app open sees a new message without reloading; the socket in
	// IBChatBox updates it immediately when the messenger itself is open.
	const { data: unreadData } = MessengerService.useUnreadMessageCount();
	const unreadMessageCount = unreadData?.getUnreadMessageCount || 0;

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
						<Divider />
						{/* "My account"/"Add another account"/"Settings" removed - unmodified MUI
						    template boilerplate with no onClick handler and no matching route, left
						    over from scaffolding. "My account" also rendered a blank, unpopulated
						    <Avatar /> right next to the correctly-working Profile item above -
						    exactly the kind of inconsistency worth cutting rather than leaving as
						    dead, confusing UI. Profile/Logout are the only two menu items that
						    actually do anything. */}
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
				{/* Who you're signed in as, above the nav.
				    Nothing in the app said this. The avatar in the app bar was the only clue, and an
				    avatar with no name is a coin-flip when a shop admin and an artist share a
				    machine at the front desk - which is exactly when acting as the wrong person
				    costs something, since role decides who sees the money.
				    Collapses to the avatar alone when the drawer is closed: the name would be
				    clipped mid-word at 56px, which reads as a rendering bug rather than as a
				    deliberately compact state. */}
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1.5,
						px: open ? 2.5 : 0,
						py: 1.75,
						justifyContent: open ? "flex-start" : "center",
					}}
				>
					<IBAvatar
						size={open ? 40 : 32}
						imgUrl={user?.avatar}
						label={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`}
					/>
					{open && (
						<Box sx={{ minWidth: 0 }}>
							<Typography
								noWrap
								title={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`}
								sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}
							>
								{user?.firstName} {user?.lastName}
							</Typography>
							{/* Two separate facts, and the shop is the one that stops a shop admin
							    at two studios wondering which set of books they're looking at. */}
							<Typography
								noWrap
								sx={{ fontSize: 12, lineHeight: 1.4, opacity: 0.65 }}
							>
								{[roleLabel(user?.role), user?.userInfo?.shop?.name]
									.filter(Boolean)
									.join(" · ")}
							</Typography>
						</Box>
					)}
				</Box>
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
					{/* Was `!isClient`, which let every artist browse the full artist directory and
					    open any other artist's page - and Artist.jsx mounts ArtistPerformancePanel,
					    so that included a shop-mate's revenue, shop-cut ledger and appointment
					    history. Artists have no reason to see each other's books; that's a shop
					    management view. Gated to Staff and above (Admin 1 / Shop Admin 10 /
					    Staff 15) to match. An artist reaches their own numbers through the
					    dashboard on Home.jsx, which mounts the same panel scoped to themselves. */}
					{isStaffOrBetter && (
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
					)}
					{isStaffOrBetter && (
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
					)}
					{!isClient && (
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
					)}
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
					{/* The "Reports" item is gone. It led to a nine-line page that rendered the
					    word "Reports" and nothing else - the only nav entry in the app pointing at
					    an empty page, so every click on it was a small lie.
					
					    Not replaced with a real Reports page, deliberately: reporting already IS
					    the dashboard. Home mounts ShopAnalyticsPanel for staff and
					    ArtistPerformancePanel for artists, both with a date-range picker, so a
					    Reports page today would be the same figures at a second URL. If one is
					    wanted later it should be something Home isn't - period-over-period
					    comparison, or exports - rather than a duplicate. */}
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
							{/* On the ICON, not the label - so the count survives the drawer being
							    collapsed, which is exactly when the label is hidden and the badge is
							    the only thing left saying there's something waiting.
							    badgeContent renders nothing at 0 by default, so no invisible-zero
							    special-casing is needed here. */}
							<Badge badgeContent={unreadMessageCount} color="error">
								<Message />
							</Badge>
						</ListItemIcon>
						<ListItemText
							primary="Messenger"
							sx={{ opacity: open ? 1 : 0 }}
						/>
					</ListItemButton>
				</List>
				{/* Every item in this group (Shops, Booking Requests, Shop Cut Confirmations) is
				    hidden from Clients - wrap the whole group (Divider + List) in !isClient so a
				    Client doesn't see a dangling divider above an empty list. */}
				{!isClient && (
				<>
				<Divider />
				<List>
					{isShopAdminOrBetter && (
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
					)}
					{!isClient && (
						<ListItemButton
							selected={selectedIndex === 9}
							onClick={(event) =>
								handleListItemClick(event, 9, "booking-requests")
							}
							key="BookingRequests"
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
								<InboxIcon />
							</ListItemIcon>
							<ListItemText
								primary="Booking Requests"
								sx={{ opacity: open ? 1 : 0 }}
							/>
						</ListItemButton>
					)}
					{isShopAdminOrBetter && (
						<ListItemButton
							selected={selectedIndex === 10}
							onClick={(event) =>
								handleListItemClick(event, 10, "shop-cut-confirmations")
							}
							key="ShopCutConfirmations"
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
								<PriceCheckIcon />
							</ListItemIcon>
							<ListItemText
								primary="Shop Cut Confirmations"
								sx={{ opacity: open ? 1 : 0 }}
							/>
						</ListItemButton>
					)}
					{isArtistUser && (
						<ListItemButton
							selected={selectedIndex === 11}
							onClick={(event) =>
								handleListItemClick(event, 11, "settings")
							}
							key="Settings"
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
								<SettingsIcon />
							</ListItemIcon>
							<ListItemText
								primary="Settings"
								sx={{ opacity: open ? 1 : 0 }}
							/>
						</ListItemButton>
					)}
				</List>
				</>
				)}
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
