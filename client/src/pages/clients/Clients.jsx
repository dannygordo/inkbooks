import React from 'react'
import './clients.css';
import EntityList from '../../components/entityList/EntityList';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';
import IBPageLoader from '../../components/ibPageLoader/IBPageLoader';
import ClientService from '../../services/ClientService';
import { ROUTE_CONSTANTS } from '../../constants';
import UtilsService from '../../services/UtilsService';

// Was a grid of IBCard tiles built off an inline gql document duplicating ClientService's own
// fetchClients query - the service query is used instead, so there's one definition of what a
// client list selects.
//
// Fields preserved from the card: avatar and name from IBCardHeader; email, phone, Instagram and
// Facebook from IBCardClientDetails. City/state/zip were in that component but commented out, so
// they weren't being shown - surfaced here as a Location column rather than silently dropped,
// since the query fetches them and a directory is exactly where "which one is the local one"
// gets asked.
const Clients = () => {
  const { loading, data } = ClientService.fetchClients();
  if (loading) return <IBPageLoader />;

  const items = (data?.getClients || []).map((client) => ({
    key: client.id,
    linkTo: `${ROUTE_CONSTANTS.CLIENT}${client.id}`,
    // Client.avatar is a GraphQL field resolver returning the live User avatar, not the stale
    // copy stored on the Client document (same fix as Staff.avatar - see resolvers/index.js), so
    // this is already the current picture without needing to select user { avatar } as the old
    // inline query did.
    avatar: client.avatar,
    primary: `${client.firstName} ${client.lastName}`,
    secondary: client.email,
    meta: [
      { label: 'Phone', value: UtilsService.formatPhone(client.phone) },
      {
        label: 'Location',
        value: [client.city, client.state].filter(Boolean).join(', '),
      },
      { label: 'Instagram', value: client.instagram },
      { label: 'Facebook', value: client.facebook },
    ],
  }));

  return (
    <div className="clients">
      <IBPageActionBar pageType='clients' />
      <EntityList items={items} emptyMessage="No clients yet." />
    </div>
  );
}

export default Clients
