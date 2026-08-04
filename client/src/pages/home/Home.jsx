import React from "react";
import "./home.css";
import { useAuth } from "../../context/auth";
import ArtistPerformancePanel from "../../components/artistDashboard/ArtistPerformancePanel";
import ClientDashboard from "../../components/clientDashboard/ClientDashboard";

// Was a bare "Dashboard" placeholder with no real content - first real content here is the
// artist's own performance view (upcoming appointments, MTD/YTD revenue and shop-cut owed, active
// projects), reusing the same panel Artist.jsx mounts for a shop's view into one specific artist.
// See PRODUCTION_ROADMAP.md for the reasoning on why the same data lives in both places, scoped
// differently (self view here vs. a shop's view of someone else on Artist.jsx).
//
// Still open: a shop-wide dashboard for Shop Admin/Staff/Client logins (aggregate across all
// connected artists, shop-wide revenue, pending confirmations count, etc.) - deliberately not
// built in this pass. Those roles currently see only the greeting below.
const Home = () => {
	const { user } = useAuth();

	return (
		<div className="home">
			<h1 className="homeTitle">{`Welcome, ${user.firstName}`}</h1>
			{user.userType === "artist" && (
				<ArtistPerformancePanel artistUserId={user.id} isSelf={true} />
			)}
			{/* Clients previously saw nothing here but the greeting above. user.userInfo.id is
			    the CLIENT document's own _id, not user.id - login() sets `userInfo.id =
			    userInfo._id` (see resolvers/users.js), and that's the id every client-scoped
			    query keys off. Passing user.id would look plausible and match nothing. */}
			{user.userType === "client" && (
				<ClientDashboard clientId={user.userInfo?.id} isSelf={true} />
			)}
			{user.userType === "staff" && (
				<div className="homeWidgets">
					Shop-wide dashboard analytics aren't built yet - see
					PRODUCTION_ROADMAP.md.
				</div>
			)}
		</div>
	);
};

export default Home;
