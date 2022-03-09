import moment from 'moment';
import IBAvatar from '../inputs/IBAvatar';
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
        <div className="ibMessageBottom">{moment(messageData.createdAt).fromNow()}</div>
    </div>
  )
}

export default IBMessage