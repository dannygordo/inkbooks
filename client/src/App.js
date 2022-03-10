import React, { useContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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

function App() {
	const { user } = useAuth();
	return (
		<SocketProvider id={ user?.id }>
			<div className="App">
				<IBDisplayPageAlert />
				<Topbar />
				<div className="container">
					<Sidebar />
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
							path="/appointments"
							element={
								<AuthRoute>
									<Appointments />
								</AuthRoute>
							}
						/>
						<Route
							path="/artists"
							element={
								<AuthRoute>
									<Artists />
								</AuthRoute>
							}
						/>
						<Route
							path="/artist/:artistId"
							element={
								<AuthRoute>
									<Artist />
								</AuthRoute>
							}
						/>
						<Route
							path="/artist/edit/:artistId"
							element={
								<AuthRoute>
									<EditArtist />
								</AuthRoute>
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
							path="/profile"
							element={
								<AuthRoute>
									<Profile />
								</AuthRoute>
							}
						/>
						<Route path="/login" element={user?.id ? <Home /> : <Login />} />
						<Route path="/register" element={user?.id ? <Home /> : <Register />} />
						<Route
							path="*"
							element={
								<IBCard
								cardData={{}} 
								cardType={APP_SETTINGS_CONSTANTS.CARD_TYPES.ROUTE_NOT_FOUND} />
							}
						/>
					</Routes>
				</div>
			</div>
		</SocketProvider>
	);
}

export default App;
