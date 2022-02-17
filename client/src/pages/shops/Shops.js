import React from 'react'
import './shops.css';
import { gql, useQuery } from '@apollo/client';
import IBCard from '../../components/card/ibCard/IBCard';
import { CircularProgress } from '@material-ui/core';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';

const Shops = () => {
    const FETCH_SHOPS_QUERY = gql`
    {
        getShops {
            id
            name
            email
            phone
            address
            city
            state
            zip
            instagram
            facebook
            website
            shopMinimum
            hourlyRate
            logo
            billingType
            status
        }
    }
  `;
  const { loading, data } = useQuery(FETCH_SHOPS_QUERY);
  if(loading) return <CircularProgress>Loading...</CircularProgress>;
  return (
    <div className="shops">
        <IBPageActionBar pageType='shops' />
        <div className="shopsContainer">
        {
          data.getShops.map((shop) => {
            return (
              <IBCard cardData={shop} key={shop.id} cardType='shop' />
            )  
          })
        }
      </div>
    </div>
  )
}

export default Shops