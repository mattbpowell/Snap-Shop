// Web-build stub for @capacitor/keep-awake.
// The real plugin is only available inside a Capacitor (iOS/Android) shell.
// isNative() returns false on web, so these methods are never actually called —
// this stub just satisfies Vite's module resolver.
export const KeepAwake = {
  keepAwake: () => Promise.resolve(),
  allowSleep: () => Promise.resolve(),
}
