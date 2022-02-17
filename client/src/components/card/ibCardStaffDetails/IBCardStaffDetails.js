import React, { useContext} from 'react';
import { AuthContext } from '../../../context/auth';
import { ROLES } from '../../../constants';
import { 
	Facebook,
	HomeOutlined,
	Instagram,
	MailOutline, 
    PhoneAndroidOutlined,
	PlaceOutlined,
    TempleBuddhistOutlined 
} from '@mui/icons-material';
import './ibCardStaffDetails.css';


const IBCardStaffDetails = (props) => {
    const { user } = useContext(AuthContext);
    const { cardData: staff } = props;
  return (
    <div className="ibCardBottom">
        <span className="ibCardDetailsTitle">Contact Details</span>
        <div className="ibCardInfoContainer">
            <TempleBuddhistOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{staff.shop.name}</span>
        </div>
        <div className="ibCardInfoContainer">
            <MailOutline className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{staff.email}</span>
        </div>
        <div className="ibCardInfoContainer">
            <PhoneAndroidOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{staff.phone}</span>
        </div>
        <div className="ibCardInfoContainer">
            <HomeOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{staff.address}</span>
        </div>
        <div className="ibCardInfoContainer">
            <PlaceOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">
                        {staff.city} {staff.state}, {staff.zip}
                    </span>
        </div>
        <div className="ibCardInfoContainer">
            <Instagram className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{staff.instagram}</span>
        </div>
        <div className="ibCardInfoContainer">
            <Facebook className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{staff.facebook}</span>
        </div>
    </div>
  )
}

export default IBCardStaffDetails