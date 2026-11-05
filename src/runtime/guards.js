// Exports de test et protection contre une double injection.
// Assemblé dans la même fermeture privée : voir README.md.
if (typeof window === 'undefined' && typeof module === 'object' && module.exports) {
  module.exports = { safeName, roleLicense, dropdownGroup, timelinePosition, timelineSeek, timestamp, recordingDates, searchDate, crc32, makeZip, wavHeader, monoPCM, filename, loginRoute, listEnvelope, paginate, portalPages, AUDIO_PATH, groupPath }; return;
}
if (window.__shopRacingArchives && typeof window.__shopRacingArchives.restore === 'function') {
  window.__shopRacingArchives.restore(); return;
}
if (document.getElementById('shop-racing-archives')) return;
window.__shopRacingArchives = { version: VERSION };
