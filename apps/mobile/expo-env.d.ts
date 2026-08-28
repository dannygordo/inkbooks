/// <reference types="expo/types" />

// Expo normally generates this file locally (any `expo` CLI command - `expo start`, etc. - writes
// it) and expects it gitignored. It's committed here instead, deliberately: CI's
// `npm run typecheck --workspace=apps/mobile` runs plain `tsc --noEmit`, never an Expo CLI
// command, so nothing would ever generate it there, and `src/constants/theme.ts`'s `@/global.css`
// side-effect import needs the CSS-module ambient declarations this file's reference pulls in
// (`node_modules/expo/types/global.d.ts`'s `declare module '*.css'`) to typecheck at all. The
// content is the same one line `expo start` would generate on your machine, so running Expo CLI
// commands locally and having this already exist on disk should never conflict.
