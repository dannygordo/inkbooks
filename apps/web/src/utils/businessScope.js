import { ROLES } from "../constants/auth";

/**
 * The owner scope every expense/income query and mutation expects - see server/graphql/
 * typeDefs.js's own header on the shopId-XOR-artistUserId ownership shape and
 * pages/settings/settingsCategories.jsx's hasAuditAuthority, which is the visibility gate that
 * decides who ever calls this at all: a shop admin at their own shop, or an independent artist
 * with no shop. Both predicates below mirror that file's exactly, rather than a third copy of the
 * same two conditions drifting from it.
 */
export const isShopAdminOrBetter = (user) => user.role <= ROLES.SHOP_ADMIN;
export const hasShop = (user) => Boolean(user.userInfo?.shop?.id);

/**
 * `{ shopId }` for a shop admin managing their shop's books, `{ artistUserId }` for everyone else
 * this feature is visible to (an independent artist managing their own). Never both, matching
 * exactly what the server's resolveBusinessOwner/assertCanManageBusinessRecord expect.
 */
export function businessScopeFor(user) {
  if (isShopAdminOrBetter(user) && hasShop(user)) {
    return { shopId: user.userInfo.shop.id };
  }
  return { artistUserId: user.id };
}

/**
 * The subset of businessScopeFor's scope that a CREATE/RECORD mutation's input actually declares -
 * shopId only (see CreateExpenseTypeInput/RecordExpenseInput/CreateRecurringExpenseInput/etc. in
 * server/graphql/typeDefs.js - none of them have an artistUserId field). That's deliberate on the
 * server: artistUserId is never client-supplied for a create, it's inferred from the authenticated
 * caller when shopId is omitted (resolveBusinessOwner, utils/shop-membership.js), precisely so a
 * request can't stamp somebody else's artistUserId on a new record.
 *
 * Spreading businessScopeFor's full result into a create input works for a shop admin (whose scope
 * is just `{shopId}`) but sends an `artistUserId` field the schema doesn't define for an
 * independent artist, which GraphQL rejects outright as an unknown input field. This is the create-
 * safe version - queries and update/delete calls should keep using businessScopeFor directly, since
 * getExpenseTypes/getExpenses/getRecurringExpenses DO accept artistUserId (see typeDefs.js's Query
 * fields) and update/delete calls don't take a scope at all (they re-check the caller against the
 * existing row's stored owner - assertCanManageBusinessRecord).
 */
export function createScopeFor(user) {
  const scope = businessScopeFor(user);
  return scope.shopId ? { shopId: scope.shopId } : {};
}
