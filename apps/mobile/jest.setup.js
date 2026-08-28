// react-native-safe-area-context ships its own jest mock (real insets/frame values, no native
// module calls) - required because jest-expo's preset does not wire it up automatically. Without
// this, any test that renders a SafeAreaView (index.tsx's HomeScreen does) throws on the native
// dimensions lookup jsdom/jest has no way to satisfy.
//
// The mock module is `export default {...}` (no named exports), so requiring it directly hands
// back `{ default: {...} }` under CJS interop - every named import (SafeAreaView included) would
// resolve to undefined. Unwrapping `.default` here puts SafeAreaView, useSafeAreaInsets, etc. back
// at the top level, matching the real module's named-export shape.
// eslint-disable-next-line no-undef
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line no-undef
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});
