import React from 'react'
import './staff.css';
import { gql, useQuery } from '@apollo/client';
import IBCard from '../../components/card/ibCard/IBCard';
import { CircularProgress } from '@material-ui/core';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';

const Staff = () => {
  const FETCH_STAFF_QUERY = gql`
    {
      getStaff {
        id
        firstName
        lastName
        email
        phone
        address
        city
        state
        zip
        instagram
        facebook
        avatar
        userId
        status
        title
        shopId
        shop {
          name
        }
      }
    }
  `;
  const { loading, data } = useQuery(FETCH_STAFF_QUERY);
  if(loading) return <CircularProgress>Loading...</CircularProgress>;
  return (
    <div className="staff">
        <IBPageActionBar pageType='staff' />
        <div className="staffContainer">
        {
          data.getStaff.map((client) => {
            return (
              <IBCard cardData={client} key={client.id} cardType='staff' />
            )  
          })
        }
      </div>
    </div>
  )
}

export default Staff 