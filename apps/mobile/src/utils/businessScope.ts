import type { CurrentUser } from '@/context/auth';
import { isShopAdminOrBetter } from '@/utils/permissions';
import { getUserShopId } from '@/utils/user';

/**
 * Direct port of apps/web's utils/businessScope.js - the owner scope every Income/Expense query
 * and mutation expects (see server/graphql/typeDefs.js's shopId-XOR-artistUserId header comment).
 * `{ shopId }` for a shop admin managing their shop's books, `{ artistUserId }` for everyone else
 * this feature is visible to (an independent OR shop-connected artist managing their own personal
 * ledger - see permissions.ts's canManageBusinessLedger for who "everyone else" actually is).
 */
export type BusinessScope = { shopId: string } | { artistUserId: string };

export function hasShop(user: CurrentUser | null | undefined): boolean {
  return Boolean(getUserShopId(user));
}

export function businessScopeFor(user: CurrentUser): BusinessScope {
  const shopId = getUserShopId(user);
  if (isShopAdminOrBetter(user) && shopId) {
    return { shopId };
  }
  return { artistUserId: user.id };
}

/**
 * The subset of businessScopeFor's scope a CREATE/RECORD mutation's input actually declares -
 * shopId only. Matches web's own createScopeFor exactly: an independent/shop-connected artist's
 * create input omits the scope object entirely (the server infers artistUserId from the
 * authenticated caller), since RecordIncomeInput/RecordExpenseInput have no artistUserId field at
 * all - sending one is a GraphQL error, not a no-op.
 */
export function createScopeFor(user: CurrentUser): { shopId?: string } {
  const scope = businessScopeFor(user);
  return 'shopId' in scope ? { shopId: scope.shopId } : {};
}
