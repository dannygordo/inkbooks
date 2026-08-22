import React from 'react';
import IBAvatar from '../inputs/IBAvatar';
import { prettyMessageTime, fullMessageTime } from '../../utils/messageTime';
import './ibMessage.css';

const IBMessage = ({own, messageData}) => {
  // Optional on the type (see typeDefs.js's Message.imageUrls: [String!]!, defaulted to [] rather
  // than null) - but a locally-built optimistic message object (see IBChatBox.jsx) may omit it
  // entirely before the real one comes back from the server, so this still guards for undefined.
  const imageUrls = messageData.imageUrls || [];
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
            <div className="ibMessageBody">
              {/* Text is optional now - an image-only message (see createMessage) has none, and an
                  empty <p> would still take up a line. */}
              {messageData.message && <p className="ibMessageText">{messageData.message}</p>}
              {imageUrls.length > 0 && (
                <div className="ibMessageImages">
                  {imageUrls.map((url) => (
                    // Full size in a new tab - simplest way to actually look at one, and this
                    // component has no lightbox/viewer of its own to build one into.
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="Attachment" className="ibMessageImageThumb" />
                    </a>
                  ))}
                </div>
              )}
            </div>
        </div>
        <div className="ibMessageBottom" title={fullMessageTime(messageData.createdAt)}>
            {prettyMessageTime(messageData.createdAt)}
        </div>
    </div>
  )
}

export default IBMessage