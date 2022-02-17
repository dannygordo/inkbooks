import React, { useContext} from 'react'
import { AuthContext } from '../../../context/auth'
import { ROLES } from '../../../constants';
import { 
	Facebook,
	HomeOutlined,
	Instagram,
	MailOutline, 
    PhoneAndroidOutlined,
	PlaceOutlined,
    Money,
    AttachMoney 
} from '@mui/icons-material';

const IBCardShopDetails = (props) => {
    const { user } = useContext(AuthContext);
    const { cardData: shop } = props;

  return (
    <div className="ibCardBottom">
        <span className="ibCardDetailsTitle">Shop Details</span>
        <div className="ibCardInfoContainer">
            <Money className="ibCardIcon"/>
            <span className="ibCardInfoTitle">${shop.hourlyRate} /hr</span>
        </div>
        <div className="ibCardInfoContainer">
            <AttachMoney className="ibCardIcon"/>
            <span className="ibCardInfoTitle">${shop.shopMinimum} min.</span>
        </div>
        <span className="ibCardDetailsTitle">Contact Details</span>
        <div className="ibCardInfoContainer">
            <MailOutline className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{shop.email}</span>
        </div>
        <div className="ibCardInfoContainer">
            <PhoneAndroidOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{shop.phone}</span>
        </div>
        <div className="ibCardInfoContainer">
            <HomeOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{shop.address}</span>
        </div>
        <div className="ibCardInfoContainer">
            <PlaceOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">
                        {shop.city} {shop.state}, {shop.zip}
                    </span>
        </div>
        <div className="ibCardInfoContainer">
            <Instagram className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{shop.instagram}</span>
        </div>
        <div className="ibCardInfoContainer">
            <Facebook className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{shop.facebook}</span>
        </div>
    </div>
  )
}

export default IBCardShopDetails