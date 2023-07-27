import React from 'react'
import IBCard from '../../components/card/ibCard/IBCard';
import { CircularProgress } from '@mui/material';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';
import './projects.css';
import ProjectService from '../../services/ProjectService';
import IBPageLoader from '../../components/ibPageLoader/IBPageLoader';
import { APP_SETTINGS_CONSTANTS } from '../../constants';

const Projects = () => {
  const { loading, data } = ProjectService.fetchProjects();
  if(loading) return <IBPageLoader />;
  console.log(APP_SETTINGS_CONSTANTS[`${process.env.NODE_ENV.toUpperCase()}`].GRAPHQL_SERVER_URL);
  console.log(process.env);
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