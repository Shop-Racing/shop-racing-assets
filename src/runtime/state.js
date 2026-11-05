// État partagé en mémoire et préférences des libellés.
// Assemblé dans la même fermeture privée : voir README.md.
let sessionURL = null, capturedHeaders = {}, sessionMethod = 'GET', sessionCredentials = 'same-origin';
let records = [], busy = false, complete = false, controller;
let panel, status, queryBox, loadButton, dateInput, zipButton, mergeButton, tbody, licence, progress, cancelButton;
let portalHost, restoreObserver, waitingForBody = false;
let licenceList, licenceToggle, licenceNumbers = [], suggestionsTask = null;
const sessionWaiters = new Set();
const activeRequests = new Set(), outputURLs = new Set();
let nativeQueryIssue = '';
let nativeAudioResult = null;
let onLoginPage = false, authGeneration = 0, sessionTimingFloor = 0, refreshPortalVisibility = () => {};
let queuePlayer, queueButton, queueStop, queueStatus, queueIndex = -1, queueSkipped = 0;
let mergedPlayback = null, timeline, timelineRange, timelineClock, timelineDate, timelineGo, timelinePlay, listeningControls;
const aliasFields = new Map();
let displayNames = {};
try {
  const stored = JSON.parse(window.localStorage?.getItem('shop-racing-archive-labels') || '{}');
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) displayNames = stored;
} catch (_) {}
