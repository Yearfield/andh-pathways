// Store build (Android / iOS): the Alternative Medicine section is left out of the store apps.
// tools/build-store.mjs copies this file over altmed.js in www/, so an old link or pin to #/altmed just goes back to the start page.
export async function altmed() { location.replace("#/"); }
