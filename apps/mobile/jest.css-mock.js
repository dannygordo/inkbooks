// Stub for global.css's side-effect import in tests. Metro (web output) and the browser both know
// how to load a real .css file; Jest's Node-based transform doesn't and doesn't need to - nothing
// under test asserts on styles a stylesheet applies, only on rendered text/testIDs.
module.exports = {};
