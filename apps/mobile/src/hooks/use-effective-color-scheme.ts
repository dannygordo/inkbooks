import { useAuth } from '@/context/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Light/dark, resolved from the account's own preference (User.themePreference) when one is set,
 * falling back to the OS setting otherwise. Direct port of web's ThemeModeProvider.jsx reasoning:
 * saved to the ACCOUNT, not the device, so it follows the user to whatever device they sign into
 * next (see DECISIONS.md X43) - unlike a plain useColorScheme() read, which only ever reflects
 * this one device's OS setting.
 *
 * 'system' and null/undefined both fall through to the OS read, same as web's own "null/absent
 * reads as 'system'" convention (server/graphql/typeDefs.js's own comment on User.themePreference).
 *
 * The one hook every screen's color choice should go through - `hooks/use-theme.ts` (the app's
 * StyleSheet color tokens) and `_layout.tsx`'s own React Navigation `ThemeProvider` (header/nav
 * chrome) both call this, so an account-level override flips the WHOLE app in the same render
 * pass, never just the screen content while the header stays on the system theme.
 */
export function useEffectiveColorScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme();
  const { user } = useAuth();
  const preference = user?.themePreference;
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return systemScheme === 'dark' ? 'dark' : 'light';
}
