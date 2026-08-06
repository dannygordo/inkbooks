import IBAvatar from '../inputs/IBAvatar';
import { prettyMessageTime, fullMessageTime } from '../../utils/messageTime';
import './ibMessage.css';

const IBMessage = ({own, messageData}) => {
  return (
    <div className={own ? "ibMessage own" : "ibMessage"}>
        <div className="ibMessageTop">
            {!own ? 
              <IBAvatar
                  size={40}
                  imgUrl={messageData.user.avatar}
                  label={`${messageData.user.firstName} ${messageData.user.lastName}`}
                  className="ibMessageImage"
              /> : 
              <></>
            }
            <p className="ibMessageText">{messageData.message}</p>
        </div>
        <div className="ibMessageBottom" title={fullMessageTime(messageData.createdAt)}>
            {prettyMessageTime(messageData.createdAt)}
        </div>
    </div>
  )
}

export default IBMessage