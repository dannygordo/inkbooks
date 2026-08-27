import React from "react";
import "./home.css";
import { useAuth } from "../../context/auth";
import ArtistPerformancePanel from "../../components/artistDashboard/ArtistPerformancePanel";
import ClientDashboard from "../../components/clientDashboard/ClientDashboard";
import ShopAnalyticsPanel from "../../components/analytics/ShopAnalyticsPanel";
import { ROLES } from "../../constants/auth";

// One route, three dashboards, picked by who's looking:
//   artist  - their own performance panel (ArtistPerformancePanel, isSelf).
//   client  - their own projects, spend, tips and appointments (ClientDashboard, isSelf).
//   staff   - shop-wide analytics (ShopAnalyticsPanel). This was the last placeholder standing;
//             Staff and Shop Admin logins saw nothing but the greeting until now.
const Home = () => {
	const { user } = useAuth();

	// Shop Admin and above see money; Staff see activity only. Passed down as a prop purely so the
	// panel knows whether to render the money cards and columns at all - the server independently
	// returns null for every currency field below this role (see resolvers/analytics.js), so this
	// is presentation, not the boundary. Getting this prop wrong would show a Staff member a row
	// of em dashes, not somebody's earnings.
	const canSeeMoney = user.role <= ROLES.SHOP_ADMIN;

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
				<ShopAnalyticsPanel
					shopId={user.userInfo?.shop?.id}
					canSeeMoney={canSeeMoney}
				/>
			)}
		</div>
	);
};

export default Home;
