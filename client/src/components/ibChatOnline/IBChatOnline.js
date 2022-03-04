import IBAvatar from '../inputs/IBAvatar';
import './ibChatOnline.css';

const IBChatOnline = () => {
  return (
    <div className="chatOnline">
        <div className="chatOnlineFriend">
            <div className="chatOnlineImageContainer">
                <IBAvatar isOnline={true} size={40} label='Danny Schreiber' />
            </div>
            <span className="chatOnlineName">Danny Schreiber</span>
        </div>
    </div>
  )
}

export default IBChatOnline