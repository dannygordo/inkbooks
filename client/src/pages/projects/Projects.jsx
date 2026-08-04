import React from 'react'
import EntityList from '../../components/entityList/EntityList';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';
import './projects.css';
import ProjectService from '../../services/ProjectService';
import IBPageLoader from '../../components/ibPageLoader/IBPageLoader';
import { APP_SETTINGS_CONSTANTS, ROUTE_CONSTANTS } from '../../constants';
import UtilsService from '../../services/UtilsService';

// Was a grid of IBCard tiles. Fields preserved from IBCardHeader + IBCardProjectDetails: title,
// truncated description, artist, client, status and deposit.
//
// Two changes worth naming:
//
// The card truncated the description at 50 characters with a hardcoded substring. The row lets
// CSS ellipse it at whatever width is actually available, so a wide screen shows more and a
// narrow one shows less - the fixed cut was always either wasteful or too short.
//
// The card rendered `project.artist.avatar` and `project.client.avatar` unconditionally, which is
// what crashed the Projects page for every project until the Project.client resolver was fixed.
// Optional-chained here so a project with a missing relation renders a row with a gap rather than
// taking the page down.
const Projects = () => {
  const { loading, data } = ProjectService.fetchProjects();
  if (loading) return <IBPageLoader />;

  const items = (data?.getProjects || []).map((project) => ({
    key: project.id,
    linkTo: `${ROUTE_CONSTANTS.PROJECT}${project.id}`,
    avatar: project.artist?.avatar,
    primary: project.title,
    secondary: project.description,
    meta: [
      {
        label: 'Artist',
        value: project.artist
          ? `${project.artist.firstName} ${project.artist.lastName}`
          : '',
      },
      {
        label: 'Client',
        value: project.client
          ? `${project.client.firstName} ${project.client.lastName}`
          : '',
      },
      {
        label: 'Status',
        value: UtilsService.prettyConstantsListValue(
          APP_SETTINGS_CONSTANTS.PROJECT_STATUS,
          project.status
        ),
      },
      {
        // Project.depositAmount is still whole dollars, unlike every other money field in the
        // app - it predates the move to integer cents and nothing writes it (deposits are now
        // recorded per-appointment; see models/Appointment.js). Rendered as-is rather than run
        // through formatCents, which would turn $200 into $2.00. Flagged for migration.
        label: 'Deposit',
        value: project.depositAmount ? `$${project.depositAmount}` : '',
      },
    ],
  }));

  return (
    <div className="projects">
      <IBPageActionBar pageType='projects' />
      <EntityList items={items} emptyMessage="No projects yet." />
    </div>
  )
}

export default Projects
