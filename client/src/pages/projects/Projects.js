import React from 'react'
import { gql, useQuery } from '@apollo/client';
import IBCard from '../../components/card/ibCard/IBCard';
import { CircularProgress } from '@material-ui/core';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';
import './projects.css';

const Projects = () => {
    const FETCH_PROJECTS_QUERY = gql`
    {
        getProjects {
            id
            title
            description
            artistId
            artist {
            email
            firstName
            lastName
            }
            clientId
            client {
            firstName
            lastName
            email
            }
            status
            depositAmount
        }
    }
  `;
  const { loading, data } = useQuery(FETCH_PROJECTS_QUERY);
  if(loading) return <CircularProgress>Loading...</CircularProgress>;

  
  return (
    <div className="projects">
        <IBPageActionBar pageType='projects' />
        <div className="projectsContainer">
        {
          data.getProjects.map((user) => {
            return (
              <IBCard cardData={user} key={user.id} cardType='project' />
            )  
          })
        }
      </div>
    </div>
  )
}

export default Projects