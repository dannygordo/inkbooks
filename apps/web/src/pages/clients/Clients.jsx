import React, { useState } from 'react'
import './clients.css';
import EntityList from '../../components/entityList/EntityList';
import EntityListPager from '../../components/entityList/EntityListPager';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';
import IBPageLoader from '../../components/ibPageLoader/IBPageLoader';
import ClientService from '../../services/ClientService';
import { ROUTE_CONSTANTS } from '../../constants';
import UtilsService from '../../services/UtilsService';
import { CLIENT_STATUS } from '../../constants';

// Was a grid of IBCard tiles built off an inline gql document duplicating ClientService's own
// fetchClients query - the service query is used instead, so there's one definition of what a
// client list selects.
//
// Fields preserved from the card: avatar and name from IBCardHeader; email, phone, Instagram and
// Facebook from IBCardClientDetails. City/state/zip were in that component but commented out, so
// they weren't being shown - surfaced here as a Location column rather than silently dropped,
// since the query fetches them and a directory is exactly where "which one is the local one"
// gets asked.
// Fixed widths so the header and every row resolve to the same grid - see EntityList.
// See Artists.jsx on the size.
const PAGE_SIZE = 50;

const CLIENT_COLUMNS = [
  { key: 'phone', label: 'Phone', width: '140px' },
  { key: 'location', label: 'Location', width: '160px' },
  { key: 'instagram', label: 'Instagram', width: '150px' },
  { key: 'facebook', label: 'Facebook', width: '150px' },
];

const Clients = () => {
  // refetch is handed to the action bar so a newly created client appears immediately.
  const [showArchived, setShowArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  // User-selectable (see EntityListPager's size selector) - PAGE_SIZE above is only the initial
  // value, kept as the constant it always was so the default is still declared in one obvious
  // place rather than buried in a useState call.
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const { loading, data, refetch } = ClientService.fetchClients(showArchived, {
    limit: pageSize,
    offset,
  });
  if (loading) return <IBPageLoader />;

  const items = (data?.getClients?.items || []).map((client) => ({
    key: client.id,
    linkTo: `${ROUTE_CONSTANTS.CLIENT}${client.id}`,
    // Client.avatar is a GraphQL field resolver returning the live User avatar, not the stale
    // copy stored on the Client document (same fix as Staff.avatar - see resolvers/index.js), so
    // this is already the current picture without needing to select user { avatar } as the old
    // inline query did.
    avatar: client.avatar,
    primary: `${client.firstName} ${client.lastName}`,
    secondary: client.email,
    archived: client.status === CLIENT_STATUS.ARCHIVED,
    values: {
      phone: UtilsService.formatPhone(client.phone),
      location: [client.city, client.state].filter(Boolean).join(', '),
      instagram: client.instagram,
      facebook: client.facebook,
    },
  }));

  return (
    <div className="clients">
      <IBPageActionBar pageType='clients' onCreated={refetch} />
      {/* Archived people are hidden by default but have to stay reachable - restoring someone
          you can't find isn't a feature. See components/archive/ArchiveControl.jsx. */}
      <label className="entityListToggle">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => {
            setShowArchived(e.target.checked);
            setOffset(0);
          }}
        />
        Show archived
      </label>
      <EntityList columns={CLIENT_COLUMNS} items={items} emptyMessage="No clients yet." />
      <EntityListPager
        pageInfo={data?.getClients?.pageInfo}
        onChange={setOffset}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setOffset(0);
        }}
        noun="client"
      />
    </div>
  );
}

export default Clients
