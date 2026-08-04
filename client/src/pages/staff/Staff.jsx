import React from 'react'
import './staff.css';
import { gql, useQuery } from '@apollo/client';
import EntityList from '../../components/entityList/EntityList';
import IBPageActionBar from '../../components/ibPageActionBar/IBPageActionBar';
import IBPageLoader from '../../components/ibPageLoader/IBPageLoader';
import { ROUTE_CONSTANTS } from '../../constants';
import UtilsService from '../../services/UtilsService';

// Was a grid of IBCard tiles. Fields preserved from IBCardHeader + IBCardStaffDetails: avatar,
// name, title, email, shop name, city/state/zip, Instagram and Facebook.
//
// The query stays inline here rather than moving to StaffService, because that service's own
// getStaff document is currently broken - it selects a bare `user`, which is an object type, so
// GraphQL rejects the whole document (fixed separately; see StaffService.js). This one selects
// `user { avatar }` properly and works, so it's the one kept.
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
      user {
        avatar
      }
    }
  }
`;

const Staff = () => {
  const { loading, data } = useQuery(FETCH_STAFF_QUERY);
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
    meta: [
      { label: 'Email', value: staff.email },
      { label: 'Phone', value: UtilsService.formatPhone(staff.phone) },
      { label: 'Shop', value: staff.shop?.name },
      {
        label: 'Location',
        value: [staff.city, staff.state].filter(Boolean).join(', '),
      },
    ],
  }));

  return (
    <div className="staff">
      <IBPageActionBar pageType='staff' />
      <EntityList items={items} emptyMessage="No staff yet." />
    </div>
  )
}

export default Staff
