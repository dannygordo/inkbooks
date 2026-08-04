import React, { useContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import "./App.css";
import Sidebar from "./components/sidebar/Sidebar";
import Topbar from "./components/topbar/Topbar";
import Home from "./pages/home/Home";
import Login from "./pages/login/Login";
import Register from "./pages/register/Register";
import Artists from "./pages/artists/Artists";
import Clients from "./pages/clients/Clients";
import { AuthProvider, AuthContext, useAuth } from "./context/auth";
import AuthRoute from "./utils/AuthRoute";
import RoleRoute from "./utils/RoleRoute";
import { ROLES } from "./constants/auth";
import Projects from "./pages/projects/Projects";
import Shops from "./pages/shops/Shops";
import Staff from "./pages/staff/Staff";
import Appointments from "./pages/appointments/Appointments";
import Reports from "./pages/reports/Reports";
import Account from "./pages/account/Account";
import Portfolio from "./pages/portfolio/Portfolio";
import Payments from "./pages/payments/Payments";
import Artist from "./pages/artists/Artist";
import EditArtist from "./components/artist/edit/EditArtist";
import Client from "./pages/clients/Client";
import IBCard from "./components/card/ibCard/IBCard";
import { APP_SETTINGS_CONSTANTS } from "./constants";
import EditClient from "./components/client/edit/EditClient";
import StaffProfile from "./pages/staff/StaffProfile";
import EditStaff from "./components/staff/edit/EditStaff";
import Project from "./pages/projects/Project";
import Shop from "./pages/shops/Shop";
import EditShop from "./components/shop/edit/EditShop";
import IBDisplayPageAlert from "./components/ibAlert/IBDisplayPageAlert";
import Messenger from "./pages/messenger/Messenger";
import { SocketProvider } from "./context/SocketProvider";
import Profile from "./pages/profile/Profile";
import ResetPassword from "./pages/resetPassword/ResetPassword";
import { CalendarProvider } from "./context/calendar";
import IBModal from "./components/ibModal/IBModal";
import BookingRequest from "./pages/booking/BookingRequest";
import GuestConversation from "./pages/booking/GuestConversation";
import ArtistBookingRequests from "./pages/booking/ArtistBookingRequests";
import ShopCutConfirmations from "./pages/shopCutConfirmations/ShopCutConfirmations";
import Settings from "./pages/settings/Settings";
import ConsultDetail from "./pages/consults/ConsultDetail";

// An artist keeps access to their own /artist/:artistId page (and its edit form) even though the
// directory is Staff-only. The route param is the Artist document's id, not the User's - see
// resolvers/artists.js's getArtist, which does Artist.findById(artistId) - and login() puts that
// same id on user.userInfo.id (resolvers/users.js sets `userInfo.id = userInfo._id`), so this is
// the pair that actually matches. Comparing against user.id instead would silently never match
// and lock every artist out of their own page.
const isOwnArtistPage = (user, params) =>
	Boolean(params?.artistId) && String(user?.userInfo?.id) === String(params.artistId);

function App() {
	const { user } = useAuth();
	return (
		<SocketProvider id={ user?.id }>
			<div className="App">
				<IBDisplayPageAlert />
				<IBModal />
				{/* <Topbar /> */}
				<div className="container">
					{user && <Sidebar />}
					{/* Sidebar.jsx renders its own MUI AppBar with position="fixed" (see that file) - a
					fixed element is taken out of normal document flow entirely, so nothing below it
					gets pushed down automatically. Sidebar's Drawer compensates for this internally
					(its own DrawerHeader spacer), but the actual routed page content never did - every
					page's content rendered starting underneath the fixed header, just by varying
					amounts depending on whether that page happened to have enough incidental top
					padding of its own to clear it (ConsultDetail's bookingRequestDetailHeader had none,
					which is what made it visibly obvious first, but this affected every page). An empty
					Toolbar, sized via the same theme.mixins.toolbar the AppBar itself uses, is MUI's own
					documented fix for exactly this "permanent mini-drawer + fixed AppBar" layout - it
					tracks the AppBar's real rendered height (which changes across breakpoints) instead
					of a hardcoded magic-number offset that could silently drift out of sync. */}
					<Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
						{user && <Toolbar />}
						<Routes>
						<Route
							path="/"
							element={
								<AuthRoute>
									<Home />
								</AuthRoute>
							}
						/>
						<Route
							path="/dashboard"
							element={
								<AuthRoute>
									<Home />
								</AuthRoute>
							}
						/>
						<Route
							path="/appointments"
							element={
								<AuthRoute>
									<CalendarProvider>
										<Appointments />
									</CalendarProvider>
								</AuthRoute>
							}
						/>
						{/* The artist directory is a management view, not a peer-browsing one: it
						    leads to Artist.jsx, which mounts ArtistPerformancePanel - another
						    artist's revenue, shop-cut ledger and appointment history. Staff and
						    above only. The server enforces the same rule (see
						    resolvers/artists.js and getAppointmentsByArtist); these guards exist
						    so a denied artist gets redirected instead of landing on a page that
						    renders a raw "Action not allowed" GraphQL error. */}
						<Route
							path="/artists"
							element={
								<RoleRoute minRole={ROLES.STAFF}>
									<Artists />
								</RoleRoute>
							}
						/>
						<Route
							path="/artist/:artistId"
							element={
								<RoleRoute minRole={ROLES.STAFF} allowIf={isOwnArtistPage}>
									<Artist />
								</RoleRoute>
							}
						/>
						<Route
							path="/artist/edit/:artistId"
							element={
								<RoleRoute minRole={ROLES.STAFF} allowIf={isOwnArtistPage}>
									<EditArtist />
								</RoleRoute>
							}
						/>
						<Route
							path="/clients"
							element={
								<AuthRoute>
									<Clients />
								</AuthRoute>
							}
						/>
						<Route
							path="/client/:clientId"
							element={
								<AuthRoute>
									<Client />
								</AuthRoute>
							}
						/>
						<Route
							path="/client/edit/:clientId"
							element={
								<AuthRoute>
									<EditClient />
								</AuthRoute>
							}
						/>
						<Route
							path="/staff"
							element={
								<AuthRoute>
									<Staff />
								</AuthRoute>
							}
						/>
						<Route
							path="/staff/:staffId"
							element={
								<AuthRoute>
									<StaffProfile />
								</AuthRoute>
							}
						/>
						<Route
							path="/staff/edit/:staffId"
							element={
								<AuthRoute>
									<EditStaff />
								</AuthRoute>
							}
						/>
						<Route
							path="/projects"
							element={
								<AuthRoute>
									<Projects />
								</AuthRoute>
							}
						/>
						<Route
							path="/project/:projectId"
							element={
								<AuthRoute>
									<Project />
								</AuthRoute>
							}
						/>
						<Route
							path="/project/edit/:projectId"
							element={
								<AuthRoute>
									<EditClient />
								</AuthRoute>
							}
						/>
						{/* A consult has no Project of its own to view/edit through - see
						pages/consults/ConsultDetail.jsx's own comment. */}
						<Route
							path="/consult/:appointmentId"
							element={
								<AuthRoute>
									<ConsultDetail />
								</AuthRoute>
							}
						/>
						<Route
							path="/reports"
							element={
								<AuthRoute>
									<Reports />
								</AuthRoute>
							}
						/>
						<Route
							path="/account"
							element={
								<AuthRoute>
									<Account />
								</AuthRoute>
							}
						/>
						<Route
							path="/shops"
							element={
								<AuthRoute>
									<Shops />
								</AuthRoute>
							}
						/>
						<Route
							path="/shop/:shopId"
							element={
								<AuthRoute>
									<Shop />
								</AuthRoute>
							}
						/>
						<Route
							path="/shop/edit/:shopId"
							element={
								<AuthRoute>
									<EditShop />
								</AuthRoute>
							}
						/>
						<Route
							path="/portfolio"
							element={
								<AuthRoute>
									<Portfolio />
								</AuthRoute>
							}
						/>
						<Route
							path="/payments"
							element={
								<AuthRoute>
									<Payments />
								</AuthRoute>
							}
						/>
						<Route
							path="/messenger"
							element={
								<AuthRoute>
									<Messenger />
								</AuthRoute>
							}
						/>
						<Route
							path="/booking-requests"
							element={
								<AuthRoute>
									<ArtistBookingRequests />
								</AuthRoute>
							}
						/>
						<Route
							path="/shop-cut-confirmations"
							element={
								<AuthRoute>
									<ShopCutConfirmations />
								</AuthRoute>
							}
						/>
						<Route
							path="/profile"
							element={
								<AuthRoute>
									<Profile />
								</AuthRoute>
							}
						/>
						<Route
							path="/settings"
							element={
								<AuthRoute>
									<Settings />
								</AuthRoute>
							}
						/>
						<Route path="/resetPassword" element={<ResetPassword />} />
						<Route path="/login" element={user?.id ? <Home /> : <Login />} />
						<Route path="/register" element={user?.id ? <Home /> : <Register />} />
						{/* Public, unauthenticated by design - no AuthRoute wrapper, same as
						/login, /register, /resetPassword above. This is the public intake form a
						prospective client fills out before any account exists. */}
						<Route path="/book/:artistId" element={<BookingRequest />} />
						{/* Token-gated, not auth-gated - see utils/guest-auth.js server-side.
						Intentionally public/no AuthRoute: the whole point is a guest with no
						account can reach this. */}
						<Route path="/booking/:token" element={<GuestConversation />} />
						<Route
							path="*"
							element={
								<IBCard
								cardData={{}} 
								cardType={APP_SETTINGS_CONSTANTS.CARD_TYPES.ROUTE_NOT_FOUND} />
							}
						/>
					</Routes>
				</Box>
			</div>
		</div>
		</SocketProvider>
	);
}

export default App;
