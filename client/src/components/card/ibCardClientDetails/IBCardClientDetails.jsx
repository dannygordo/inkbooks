import React, { useContext} from 'react'
import { AuthContext } from '../../../context/auth'
import { 
	Facebook,
	HomeOutlined,
	Instagram,
	MailOutlined, 
    PhoneAndroidOutlined,
	PlaceOutlined 
} from '@mui/icons-material';
import UtilsService from '../../../services/UtilsService';

const IBCardClientDetails = (props) => {
    const { user } = useContext(AuthContext);
    const { cardData: client } = props;

  return (
    <div className="ibCardBottom">
        {/* <span className="ibCardDetailsTitle">Account Details</span> */}
        
        <span className="ibCardDetailsTitle">Contact Details</span>
        <div className="ibCardInfoContainer">
            <MailOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{client.email}</span>
        </div>
        <div className="ibCardInfoContainer">
            <PhoneAndroidOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{UtilsService.formatPhone(client.phone)}</span>
        </div>
        {/* <div className="ibCardInfoContainer">
            <HomeOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">{client.address}</span>
        </div>
        <div className="ibCardInfoContainer">
            <PlaceOutlined className="ibCardIcon"/>
            <span className="ibCardInfoTitle">
                        {client.city} {client.state}, {client.zip}
                    </span>
        </div> */}
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