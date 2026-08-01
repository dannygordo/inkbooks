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
  // import.meta.env.MODE (Vite) replaces process.env.NODE_ENV (CRA/webpack) - see index.js's
  // comment on the same swap. `process` itself doesn't exist at all under Vite (no polyfill,
  // unlike CRA/webpack), so the old `console.log(process.env)` below would have thrown
  // "process is not defined" and crashed this component's render the moment it ran -
  // import.meta.env is the closest equivalent, though it only exposes Vite's own env keys
  // (MODE/DEV/PROD/BASE_URL, plus any VITE_*-prefixed vars), not a full process.env dump.
  console.log(APP_SETTINGS_CONSTANTS[`${import.meta.env.MODE.toUpperCase()}`].GRAPHQL_SERVER_URL);
  console.log(import.meta.env);
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