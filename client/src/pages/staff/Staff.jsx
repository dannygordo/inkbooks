import React, { useState } from 'react'
import './staff.css';
import { gql, useQuery } from '@apollo/client';
import EntityList from '../../components/entityList/EntityList';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';
import IBPageLoader from '../../components/ibPageLoader/IBPageLoader';
import { ROUTE_CONSTANTS, STAFF_STATUS } from '../../constants';
import UtilsService from '../../services/UtilsService';

// Was a grid of IBCard tiles. Fields preserved from IBCardHeader + IBCardStaffDetails: avatar,
// name, title, email, shop name, city/state/zip, Instagram and Facebook.
//
// The query stays inline here rather than moving to StaffService, because that service's own
// getStaff document is currently broken - it selects a bare `user`, which is an object type, so
// GraphQL rejects the whole document (fixed separately; see StaffService.js). This one selects
// `user { avatar }` properly and works, so it's the one kept.
const FETCH_STAFF_QUERY = gql`
  query GetStaff($includeArchived: Boolean) {
    getStaff(includeArchived: $includeArchived) {
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
      user {
        avatar
      }
    }
  }
`;

const STAFF_COLUMNS = [
  { key: 'email', label: 'Email', width: '220px' },
  { key: 'phone', label: 'Phone', width: '140px' },
  { key: 'shop', label: 'Shop', width: '160px' },
  { key: 'location', label: 'Location', width: '160px' },
];

const Staff = () => {
  const [showArchived, setShowArchived] = useState(false);
  // refetch is handed to the action bar so a newly created staff member appears immediately.
  const { loading, data, refetch } = useQuery(FETCH_STAFF_QUERY, {
    variables: { includeArchived: showArchived },
  });
  if (loading) return <IBPageLoader />;

  const items = (data?.getStaff || []).map((staff) => ({
    key: staff.id,
    // ROUTE_CONSTANTS.STAFF ("/staff/"), matching what the card linked to. Worth noting that
    // ROUTE_CONSTANTS.STAFF_PROFILE ("/staff-profile/") sits right beside it in the constants and
    // has no route registered in App.jsx at all - StaffProfile renders at /staff/:staffId. Using
    // the more descriptive-sounding constant would have produced a dead link.
    linkTo: `${ROUTE_CONSTANTS.STAFF}${staff.id}`,
    avatar: staff.user?.avatar || staff.avatar,
    primary: `${staff.firstName} ${staff.lastName}`,
    secondary: staff.title,
    archived: staff.status === STAFF_STATUS.ARCHIVED,
    values: {
      email: staff.email,
      phone: UtilsService.formatPhone(staff.phone),
      shop: staff.shop?.name,
      location: [staff.city, staff.state].filter(Boolean).join(', '),
    },
  }));

  return (
    <div className="staff">
      <IBPageActionBar pageType='staff' onCreated={refetch} />
      {/* Archived people are hidden by default but have to stay reachable - restoring someone
          you can't find isn't a feature. See components/archive/ArchiveControl.jsx. */}
      <label className="entityListToggle">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>
      <EntityList columns={STAFF_COLUMNS} items={items} emptyMessage="No staff yet." />
    </div>
  )
}

export default Staff
