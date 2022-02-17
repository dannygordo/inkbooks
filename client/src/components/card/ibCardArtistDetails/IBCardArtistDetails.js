import React, { useContext } from "react";
import { AuthContext } from "../../../context/auth";
import { APP_SETTINGS_CONSTANTS } from "../../../constants";
import {
	CalendarTodayOutlined,
	Facebook,
	HomeOutlined,
	Instagram,
	MailOutline,
	PhoneAndroidOutlined,
	PlaceOutlined,
	TitleOutlined,
} from "@mui/icons-material";
import moment from "moment";

const IBCardArtistDetails = (props) => {
	const { user } = useContext(AuthContext);
	const { cardData: artist } = props;
	return (
		<div className="ibCardBottom">
			<span className="ibCardDetailsTitle">Account Details</span>
			<div className="ibCardInfoContainer">
				<MailOutline className="ibCardIcon" />
				<span className="ibCardInfoTitle">{artist.email}</span>
			</div>
			<div className="ibCardInfoContainer">
				<CalendarTodayOutlined className="ibCardIcon" />
				<span className="ibCardInfoTitle">
					{moment(artist.startDate).format(
						APP_SETTINGS_CONSTANTS.DATE_FORMAT
					)}
				</span>
			</div>
			<div className="ibCardInfoContainer">
				<TitleOutlined className="ibCardIcon" />
				<span className="ibCardInfoTitle">{artist.title}</span>
			</div>
			<span className="ibCardDetailsTitle">Contact Details</span>
			<div className="ibCardInfoContainer">
				<HomeOutlined className="ibCardIcon" />
				<span className="ibCardInfoTitle">{artist.address}</span>
			</div>
			<div className="ibCardInfoContainer">
				<PlaceOutlined className="ibCardIcon" />
				<span className="ibCardInfoTitle">
					{artist.city} {artist.state}, {artist.zip}
				</span>
			</div>
			<div className="ibCardInfoContainer">
				<Instagram className="ibCardIcon" />
				<span className="ibCardInfoTitle">{artist.instagram}</span>
			</div>
			<div className="ibCardInfoContainer">
				<Facebook className="ibCardIcon" />
				<span className="ibCardInfoTitle">{artist.facebook}</span>
			</div>
			<div className="ibCardInfoContainer">
				<PhoneAndroidOutlined className="ibCardIcon" />
				<span className="ibCardInfoTitle">{artist.phone}</span>
			</div>
		</div>
	);
};

export default IBCardArtistDetails;
