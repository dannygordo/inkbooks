/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Copper Wolf's brand palette (2026-09-10) - ported from apps/web's design tokens
// (apps/web/src/theme/tokens.css), which was deliberately rebuilt around a dark copper primary
// (#9c5a30) "at the shop's direction" per that file's own header comment. Mobile had never picked
// any of this up: Button.tsx's "primary" variant was theme.text/theme.background (plain
// black-on-white), and ThemedText's linkPrimary hardcoded a leftover Expo-template blue
// (#3c87f7) unrelated to either. Every screen that goes through those two shared primitives picks
// up the real brand color the moment these values change - no per-screen edits needed.
// text/background/backgroundElement/backgroundSelected/textSecondary are UNCHANGED (existing
// screens already depend on their current values) - everything below is additive.
export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    textMuted: '#9c8b7a',
    border: '#e0d5c8',
    borderStrong: '#c9b8a4',
    primary: '#9c5a30',
    primaryHover: '#7e4726',
    primaryBg: '#f7ece3',
    primaryBorder: '#e0c4a8',
    primaryContrast: '#ffffff',
    primaryDisabled: '#d9b89a',
    success: '#4a7043',
    successBg: '#eaf0e2',
    error: '#b3452e',
    errorBg: '#fbeae5',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    textMuted: '#8f7c6a',
    border: '#453a30',
    borderStrong: '#5c4d3f',
    primary: '#d38a51',
    primaryHover: '#e29e68',
    primaryBg: '#3a2a1c',
    primaryBorder: '#5c4530',
    // Light copper needs dark text to hold contrast, not white - same call as web's own dark
    // palette on MUI's primary.contrastText (tokens.css's own comment on --ib-primary-contrast).
    primaryContrast: '#241c17',
    primaryDisabled: '#5c4530',
    success: '#7fa86f',
    successBg: '#24301e',
    error: '#e2795a',
    errorBg: '#3d2018',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
