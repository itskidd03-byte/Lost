// Account configuration for the published game.
//
// The game is a static site: there is no server of ours. Sign-in talks straight
// to a hosted auth API from the browser, so it works on GitHub Pages and any
// other static host. Fill these two values in to switch the account gate on.
//
//   url — the project URL of the auth service, e.g. https://abcdefgh.supabase.co
//   key — its public ("anon") key. This one is safe in a static site; never put
//         a service-role or secret key here.
//
// Left empty, the game runs without accounts and keeps the world on the device.
export const AUTH = {
  url: '',
  key: '',
};
