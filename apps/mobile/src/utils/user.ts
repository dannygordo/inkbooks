import type { CurrentUser } from '@/context/auth';

// login.graphql's userInfo selection carries three concrete shapes (Artist/Client/Staff - see
// that file's own header comment on why Artist/Staff's shop.id is selected at all). Only
// Artist/Staff have a shop, and `__typename` is the field to branch on - it isn't written into
// login.graphql explicitly, but every real network response carries it regardless (Apollo Client's
// InMemoryCache requires __typename for normalization, so its HttpLink appends it to every
// outgoing query automatically; this is a runtime guarantee independent of what the .graphql
// source file spells out).
export function getUserShopId(user: CurrentUser | null | undefined): string | undefined {
  const userInfo = user?.userInfo;
  if (userInfo?.__typename === 'Artist' || userInfo?.__typename === 'Staff') {
    return userInfo.shop?.id ?? undefined;
  }
  return undefined;
}
