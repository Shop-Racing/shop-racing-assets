// Construction de la fenêtre et gestion du cycle de vie.
// Assemblé dans la même fermeture privée : voir README.md.
function mount() {
  if (!document.body) {
    if (!waitingForBody) { waitingForBody = true; document.addEventListener('DOMContentLoaded', mount, { once: true }); }
    return;
  }
  if (portalHost) {
    if (!portalHost.isConnected) document.body.appendChild(portalHost);
    refreshPortalVisibility();
    return;
  }
  const old = document.getElementById('srbtn'); if (old) old.remove();
  const host = el('div', null, document.body); portalHost = host; host.id = 'shop-racing-archives';
  host.style.cssText = 'position:fixed!important;display:block!important;visibility:visible!important;opacity:1!important;bottom:16px!important;left:16px!important;z-index:2147483647!important';
  const root = host.attachShadow({ mode: 'closed' });
  const style = el('style', null, root);
  style.textContent = ARCHIVE_CSS;
  const launch = el('button', 'Historique Audio', root); launch.setAttribute('aria-haspopup', 'dialog');
  const placeLaunch = () => {
    if (isLoginPage()) {
      if (!onLoginPage) { onLoginPage = true; clearRadioSession(); }
      host.style.cssText = 'display:none!important;';
      return;
    }
    onLoginPage = false;
    let position = 'bottom:16px!important;left:16px!important;top:auto!important;right:auto!important;';
    if (document.querySelectorAll) for (const node of document.querySelectorAll('a,button,li,[role="menuitem"],div,span')) {
      if (!/^(settings|paramètres|parametres)$/i.test(String(node.textContent || '').trim()) || !node.getBoundingClientRect) continue;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.top < 0 || rect.bottom > 150) continue;
      const height = launch.getBoundingClientRect().height || 41;
      const width = launch.getBoundingClientRect().width || 150;
      const left = Math.round(rect.right + 12), top = Math.max(8, Math.round(rect.top + (rect.height - height) / 2));
      if (left + width + 16 <= window.innerWidth) position = 'top:' + top + 'px!important;left:' + left + 'px!important;bottom:auto!important;right:auto!important;';
      break;
    }
    host.style.cssText = 'position:fixed!important;display:block!important;visibility:visible!important;opacity:1!important;z-index:2147483647!important;' + position;
  };
  let placementPending = false;
  const schedulePlacement = () => {
    if (placementPending) return;
    placementPending = true;
    const run = () => { placementPending = false; placeLaunch(); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run); else run();
  };
  window.addEventListener?.('resize', schedulePlacement, { passive: true });
  window.addEventListener?.('scroll', schedulePlacement, { passive: true });
  window.addEventListener?.('popstate', schedulePlacement);
  window.addEventListener?.('hashchange', schedulePlacement);
  refreshPortalVisibility = placeLaunch;
  for (const name of ['pushState', 'replaceState']) {
    try {
      const original = window.history?.[name];
      if (original) window.history[name] = function () { const result = original.apply(this, arguments); placeLaunch(); return result; };
    } catch (_) { /* DOM and navigation events still refresh visibility. */ }
  }
  schedulePlacement();
  panel = el('dialog', null, root); panel.setAttribute('aria-label', 'Shop-Racing Historique Audio');
  const header = el('header', null, panel); el('h2', 'Shop-Racing · Historique Audio', header);
  const close = el('button', 'Fermer', header);
  const closePanel = () => { root.querySelectorAll('audio').forEach(a => a.pause()); panel.close(); launch.focus(); };
  close.onclick = closePanel; panel.addEventListener('cancel', e => { e.preventDefault(); closePanel(); });
  el('small', 'Version ' + VERSION, panel);
  const tools = el('div', null, panel); tools.className = 'tools';
  const scopeLabel = el('label', 'Écouter', tools); scopeSelect = el('select', null, scopeLabel);
  el('option', 'Toute une licence', scopeSelect).value = 'licence'; el('option', 'Un groupe seul', scopeSelect).value = 'group'; scopeSelect.value = 'licence';
  scopeSelect.onchange = () => { stopQueue(); syncScopeControls(); };
  const label = el('label', 'Licence', tools), combo = el('div', null, label); combo.className = 'licence-combo'; licenceControl = label;
  licence = el('input', null, combo); licence.inputMode = 'numeric'; licence.placeholder = 'Choisir une licence';
  licence.setAttribute('autocomplete', 'off'); licence.setAttribute('role', 'combobox'); licence.setAttribute('aria-controls', 'sr-licences'); licence.setAttribute('aria-expanded', 'false');
  licenceToggle = el('button', '⌄', combo); licenceToggle.type = 'button'; licenceToggle.className = 'licence-toggle'; licenceToggle.setAttribute('aria-label', 'Afficher les licences');
  licenceList = el('ul', null, combo); licenceList.id = 'sr-licences'; licenceList.className = 'licence-menu'; licenceList.hidden = true; licenceList.setAttribute('role', 'listbox');
  licenceToggle.onclick = () => showLicenceMenu(licenceList.hidden);
  licence.onclick = () => showLicenceMenu(true);
  licence.oninput = () => { showLicenceMenu(true, true); refreshLabelFields(); };
  licence.onkeydown = event => {
    if (event.key === 'Escape') { showLicenceMenu(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); showLicenceMenu(true, true);
      const options = licenceList.querySelectorAll('button');
      (event.key === 'ArrowDown' ? options[0] : options[options.length - 1])?.focus();
    }
  };
  combo.addEventListener('focusout', event => { if (!combo.contains(event.relatedTarget)) showLicenceMenu(false); });
  groupControl = el('label', 'Groupe', tools); groupSelect = el('select', null, groupControl); groupControl.hidden = true;
  el('option', 'Choisir un groupe', groupSelect).value = '';
  groupSelect.onchange = () => { const g = availableGroups.get(groupSelect.value), parsed = g && roleLicense(g.label); if (parsed) { licence.value = parsed.license; refreshLabelFields(); } };
  const dateLabel = el('label', 'Date et heure de début', tools); dateInput = el('input', null, dateLabel);
  dateInput.type = 'datetime-local'; dateInput.step = '1'; dateInput.required = true;
  loadButton = el('button', 'Charger les archives', tools); loadButton.onclick = load;
  zipButton = el('button', 'Exporter tous les audios en ZIP', tools); zipButton.disabled = true; zipButton.onclick = exportZip;
  mergeButton = el('button', 'Créer un audio unique (WAV)', tools); mergeButton.disabled = true; mergeButton.onclick = () => exportMerged(false);
  cancelButton = el('button', 'Annuler', tools); cancelButton.hidden = true; cancelButton.onclick = () => controller && controller.abort();
  const labels = el('details', null, panel); el('summary', 'Modifier les libellés des groupes', labels);
  for (const role of ['VOITURE', 'INGENIEUR', 'MECANO', 'MECANICIEN']) {
    const row = el('label', role, labels), field = el('input', null, row); field.maxLength = 80;
    field.placeholder = role === 'VOITURE' ? 'Ex. Voiture n°23' : 'Libellé personnalisé'; aliasFields.set(role, field);
  }
  const saveLabels = el('button', 'Enregistrer les libellés', labels);
  saveLabels.onclick = () => {
    const number = licence.value.trim();
    if (!/^\d+$/.test(number)) { message('Choisissez une licence avant de modifier ses libellés.'); return; }
    const names = {}; for (const [role, field] of aliasFields) { const value = field.value.trim().slice(0, 80); if (value) names[role] = value; }
    displayNames[number] = names;
    let persisted = true;
    try { if (!window.localStorage) persisted = false; else window.localStorage.setItem('shop-racing-archive-labels', JSON.stringify(displayNames)); } catch (_) { persisted = false; }
    renderRows(); updateQueueLabel(); offerGroups([]);
    message('Libellés mis à jour pour la licence ' + number + (persisted ? '.' : ' pour cette session (stockage local indisponible).'));
  };
  const listening = el('div', null, panel); listening.className = 'tools'; listeningControls = listening;
  queueButton = el('button', 'Tout écouter', listening); queueButton.disabled = true;
  queueStop = el('button', 'Arrêter', listening); queueStop.disabled = true; queueStop.onclick = () => { if (mergedPlayback) { queuePlayer.pause(); queuePlayer.currentTime = 0; updateTimeline(); } else stopQueue(); };
  queuePlayer = el('audio', null, listening); queuePlayer.controls = true; queuePlayer.preload = 'none'; queuePlayer.setAttribute('aria-label', 'Lecture successive des archives');
  queueStatus = el('p', '', panel); queueStatus.setAttribute('role', 'status');
  queuePlayer.onplay = () => { queueButton.textContent = 'Pause'; syncTimelinePlay(); };
  queuePlayer.onpause = () => { if (queueIndex >= 0) queueButton.textContent = 'Reprendre'; syncTimelinePlay(); };
  queuePlayer.onended = () => { if (mergedPlayback) { updateTimeline(); queueButton.textContent = 'Reprendre'; syncTimelinePlay(); } else if (queueIndex >= 0) playQueue(queueIndex + 1); };
  queuePlayer.onerror = () => { if (mergedPlayback) { message('Lecture de l’audio complet impossible. Relancez sa préparation.'); return; } if (queueIndex >= 0) { queueSkipped++; playQueue(queueIndex + 1); } };
  queueButton.onclick = async () => {
    if (busy) return;
    if (queueIndex >= 0) { if (queuePlayer.paused) { try { await queuePlayer.play(); } catch (_) {} } else queuePlayer.pause(); return; }
    for (const audio of tbody.querySelectorAll('audio')) audio.pause();
    queueSkipped = 0;
    if (window.AudioContext || window.webkitAudioContext) await exportMerged(true);
    else await playQueue(0);
  };
  timeline = el('div', null, panel); timeline.className = 'audio-timeline'; timeline.hidden = true;
  timelinePlay = el('button', '▶ Lecture', timeline); timelinePlay.type = 'button';
  timelinePlay.onclick = async () => { if (!mergedPlayback) return; if (queuePlayer.paused) { try { await queuePlayer.play(); } catch (_) { message('Lecture impossible. Réessayez.'); } } else queuePlayer.pause(); syncTimelinePlay(); };
  timelineClock = el('output', '—', timeline); timelineClock.setAttribute('aria-label', 'Date et heure de l’enregistrement');
  timelineRange = el('input', null, timeline); timelineRange.type = 'range'; timelineRange.min = '0'; timelineRange.step = '0.01'; timelineRange.value = '0';
  timelineRange.setAttribute('aria-label', 'Naviguer dans tous les échanges');
  timelineRange.oninput = () => { if (mergedPlayback) { queuePlayer.currentTime = Number(timelineRange.value); updateTimeline(); } };
  const jump = el('div', null, timeline); jump.className = 'tools';
  const jumpLabel = el('label', 'Aller à l’heure', jump); timelineDate = el('input', null, jumpLabel); timelineDate.type = 'datetime-local'; timelineDate.step = '1';
  timelineGo = el('button', 'Aller', jump); timelineGo.onclick = () => {
    if (!mergedPlayback || !timelineDate.value) return;
    const time = timestamp(timelineDate.value); if (!Number.isFinite(time)) return;
    queuePlayer.currentTime = timelineSeek(mergedPlayback.markers, time); updateTimeline();
  };
  queuePlayer.ontimeupdate = updateTimeline; queuePlayer.onseeked = updateTimeline;
  queryBox = el('details', null, panel); queryBox.hidden = true; queryBox.open = true;
  el('summary', 'Query de session — solution de secours', queryBox);
  const queryLabel = el('label', 'Query', queryBox); const input = el('input', null, queryLabel);
  input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false;
  el('small', 'Uniquement si la détection échoue : collez localement la Query de la requête /ptt/audio, puis rechargez. Ne la partagez pas.', queryBox);
  status = el('p', '', panel); status.id = 'status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  progress = el('progress', null, panel); progress.max = 1; progress.value = 0; progress.setAttribute('aria-label', 'Progression');
  const wrap = el('div', null, panel); wrap.className = 'table'; const table = el('table', null, wrap);
  const head = el('tr', null, el('thead', null, table));
  ['Date / heure', 'Groupe', 'Utilisateur', 'Lecture', 'Téléchargement'].forEach(t => el('th', t, head)); tbody = el('tbody', null, table);
  launch.onclick = () => {
    if (isLoginPage()) { placeLaunch(); return; }
    if (!panel.open) panel.showModal(); discover();
    if (!dateInput.value) {
      const initial = searchDate(pageDateInput()?.value) || searchDate(sessionURL?.searchParams.get('start_time'));
      if (initial) dateInput.value = initial.replace(' ', 'T');
    }
    if (!licence.value) {
      const selected = Array.from(dropdownGroups().values());
      if (selected.length === 1 && selected[0].license) licence.value = selected[0].license;
    }
    refreshLabelFields();
    if (!busy && !records.length) message(sessionURL ? 'Session détectée. Saisissez votre licence.' : 'Ouvrez une recherche audio dans le portail, puis cliquez sur Charger les archives.');
    licence.focus();
    suggestLicences();
  };
  // Keep the same UI and in-memory session when the SPA replaces its page or body.
  if (typeof MutationObserver !== 'undefined') {
    restoreObserver = new MutationObserver(() => {
      if (document.body && !host.isConnected) document.body.appendChild(host);
      schedulePlacement();
    });
    restoreObserver.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  }
}
