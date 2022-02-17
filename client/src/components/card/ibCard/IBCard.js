import React from 'react'
import IBCardActions from '../ibCardActions/IBCardActions';
import IBCardArtistDetails from '../ibCardArtistDetails/IBCardArtistDetails';
import IBCardClientDetails from '../ibCardClientDetails/IBCardClientDetails';
import IBCardHeader from '../ibCardHeader/IBCardHeader';
import IBCardProjectDetails from '../ibCardProjectDetails/IBCardProjectDetails';
import IBCardShopDetails from '../ibCardShopDetails/IBCardShopDetails';
import IBCardStaffDetails from '../ibCardStaffDetails/IBCardStaffDetails';
import './ibCard.css';

const IBCard = (props) => {
  const {cardData, cardType} = props;
  switch(cardType) {
    case 'artist':
      return (
        <div className="ibCard" key={cardData.id}>
          <div className="ibCardActionsContainer">
            <IBCardActions cardData={cardData} key={cardData.id}/>
          </div>
          <IBCardHeader cardType='artist' cardData={cardData} key={cardData.id} />
          <IBCardArtistDetails cardData={cardData} key={Date.now()} />
        </div>
      );
    case 'client':
      return (
        <div className="ibCard" key={cardData.id}>
          <div className="ibCardActionsContainer">
            <IBCardActions cardData={cardData} key={cardData.id}/>
          </div>
          <IBCardHeader cardType='client' cardData={cardData} key={cardData.id} />
          <IBCardClientDetails cardData={cardData} key={Date.now()} />
        </div>
      );
    case 'project':
      return (
        <div className="ibCard" key={cardData.id}>
          <div className="ibCardActionsContainer">
            <IBCardActions cardData={cardData} key={cardData.id}/>
          </div>
          <IBCardHeader cardData={cardData} key={cardData.id} cardType='project' />
          <IBCardProjectDetails cardData={cardData} key={Date.now()} />
        </div>
      );
    case 'shop':
      return (
        <div className="ibCard" key={cardData.id}>
          <div className="ibCardActionsContainer">
            <IBCardActions cardData={cardData} key={cardData.id}/>
          </div>
          <IBCardHeader cardData={cardData} key={cardData.id} cardType='shop' />
          <IBCardShopDetails cardData={cardData} key={Date.now()} />
        </div>
      );
    case 'staff':
      return (
        <div className="ibCard" key={cardData.id}>
          <div className="ibCardActionsContainer">
            <IBCardActions cardData={cardData} key={cardData.id}/>
          </div>
          <IBCardHeader cardData={cardData} key={cardData.id} cardType='staff' />
          <IBCardStaffDetails cardData={cardData} key={Date.now()} />
        </div>
      );
    default:
      return (
        <div className="ibCard" key={cardData.id}>
          <div className="ibCardActionsContainer">
            <IBCardActions cardData={cardData} key={cardData.id}/>
          </div>
          <IBCardHeader cardData={cardData} key={cardData.id} />
        </div>
      )
  }
  
}

export default IBCard