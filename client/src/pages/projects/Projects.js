import React from 'react'
import IBCard from '../../components/card/ibCard/IBCard';
import { CircularProgress } from '@material-ui/core';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';
import './projects.css';
import ProjectService from '../../services/ProjectService';
import IBPageLoader from '../../components/ibPageLoader/IBPageLoader';

const Projects = () => {
  const { loading, data } = ProjectService.fetchProjects();
  if(loading) return <IBPageLoader />;
  
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