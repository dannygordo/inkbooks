import React, { useContext} from 'react'
import { AuthContext } from '../../../context/auth'
import { ROLES } from '../../../constants';
import { 
	Facebook,
	HomeOutlined,
	Instagram,
	MailOutline, 
    PhoneAndroidOutlined,
	PlaceOutlined 
} from '@mui/icons-material';

const IBCardClientDetails = (props) => {
    const { user } = useContext(AuthContext);
    const { cardData: client } = props;

  return (
    <div className="ibCardBottom">
        {/* <span className="ibCardDetailsTitle">Account Details</span> */}
        
        <span className="ibCardDetailsTitle">Contact Details</span>
        <div className="ibCardInfoContainer">
            <MailOutline className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{client.email}</span>
        </div>
        <div className="ibCardInfoContainer">
            <PhoneAndroidOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{client.phone}</span>
        </div>
        <div className="ibCardInfoContainer">
            <HomeOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{client.address}</span>
        </div>
        <div className="ibCardInfoContainer">
            <PlaceOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">
                        {client.city} {client.state}, {client.zip}
                    </span>
        </div>
        <div className="ibCardInfoContainer">
            <Instagram className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{client.instagram}</span>
        </div>
        <div className="ibCardInfoContainer">
            <Facebook className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{client.facebook}</span>
        </div>
    </div>
  )
}

export default IBCardClientDetails