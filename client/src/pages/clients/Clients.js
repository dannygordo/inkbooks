import React from 'react'
import './clients.css';
import { gql, useQuery } from '@apollo/client';
import IBCard from '../../components/card/ibCard/IBCard';
import { CircularProgress } from '@mui/material';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';

const Clients = () => {
  const FETCH_CLIENTS_QUERY = gql`
    {
      getClients {
        id
        firstName
        lastName
        email
        phone
        address
        city
        zip
        state
        instagram
        facebook
        avatar
        userId
      }
    }
  `;
  const { loading, data } = useQuery(FETCH_CLIENTS_QUERY);
  if(loading) return <CircularProgress>Loading...</CircularProgress>;
  return(
    <div className="clients">
        <IBPageActionBar pageType='clients' />
        <div className="clientsContainer">
        {
          data.getClients.map((client) => {
            return (
              <IBCard cardData={client} key={client.id} cardType='client' />
            )  
          })
        }
      </div>
    </div>
  );
}

export default Clients