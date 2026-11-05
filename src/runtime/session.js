// Déconnexion et effacement de la session.
// Assemblé dans la même fermeture privée : voir README.md.
function isLoginPage() {
  if (loginRoute(location.href)) return true;
  if (!document.querySelectorAll) return false;
  return Array.from(document.querySelectorAll('.site-page--login, .login-container, .login-form, form[action*="login"], form[action*="signin"]'))
    .some(node => !node.getClientRects || node.getClientRects().length > 0);
}
function clearRadioSession() {
  authGeneration++;
  sessionTimingFloor = performance.now ? performance.now() : 0;
  controller?.abort();
  for (const request of activeRequests) request.abort();
  activeRequests.clear();
  for (const url of outputURLs) revokeOutputURL(url);
  outputURLs.clear();
  for (const ready of sessionWaiters) ready(false);
  sessionWaiters.clear();
  sessionURL = null; capturedHeaders = {}; nativeAudioResult = null;
  sessionMethod = 'GET'; sessionCredentials = 'same-origin';
  records = []; complete = false; candidates.clear(); availableGroups.clear(); licenceNumbers = []; loadedScope = null;
  if (groupSelect) { groupSelect.replaceChildren(); groupSelect.value = ''; }
  if (scopeSelect) { scopeSelect.value = 'licence'; syncScopeControls(); }
  stopQueue();
  if (panel) { for (const audio of panel.querySelectorAll('audio')) audio.pause(); if (panel.open) panel.close(); }
  if (status) status.textContent = '';
  if (tbody) tbody.replaceChildren();
  for (const field of aliasFields.values()) field.value = '';
  if (licenceList) licenceList.replaceChildren();
  if (licence) licence.value = '';
  if (dateInput) dateInput.value = '';
  if (queryBox) { queryBox.querySelector('input').value = ''; queryBox.hidden = true; }
  if (mergeButton && queueButton) setBusy(false);
}
