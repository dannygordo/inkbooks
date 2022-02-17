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
import { AuthProvider, AuthContext } from "./context/auth";
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

function App() {
	return (
		<AuthProvider>
			<div className="App">
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
							path="/staff"
							element={
								<AuthRoute>
									<Staff />
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
						<Route path="/login" element={<Login />} />
						<Route path="/register" element={<Register />} />
						<Route
							path="*"
							element={
								<main style={{ padding: "1rem" }}>
									<p>There's nothing here!</p>
								</main>
							}
						/>
					</Routes>
				</div>
			</div>
		</AuthProvider>
	);
}

export default App;
