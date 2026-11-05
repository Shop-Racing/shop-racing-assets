// Lecture, pause et frise chronologique.
// Assemblé dans la même fermeture privée : voir README.md.
function stopQueue(text) {
  queueIndex = -1;
  if (mergedPlayback) { revokeOutputURL(mergedPlayback.url); mergedPlayback = null; }
  if (timeline) timeline.hidden = true;
  if (listeningControls) listeningControls.hidden = false;
  if (queueStatus) queueStatus.hidden = false;
  if (!queuePlayer) return;
  queuePlayer.pause(); queuePlayer.removeAttribute('src'); queuePlayer.load?.();
  queueButton.textContent = 'Tout écouter'; queueStop.disabled = true;
  queueStatus.textContent = text || '';
}
function updateQueueLabel() {
  if (mergedPlayback) { updateTimeline(); return; }
  const r = records[queueIndex]; if (!r) return;
  queueStatus.textContent = 'Écoute ' + (queueIndex + 1) + '/' + records.length + ' · ' + groupLabel(r) + ' · ' + r.user +
    (Number.isFinite(r.time) ? ' · ' + new Date(r.time).toLocaleString('fr-FR') : '') + (queueSkipped ? ' · ' + queueSkipped + ' indisponibles ignorés' : '');
}
async function playQueue(index) {
  while (index < records.length && !records[index].url) { index++; queueSkipped++; }
  if (index >= records.length) { stopQueue('Lecture terminée.' + (queueSkipped ? ' ' + queueSkipped + ' audios indisponibles ignorés.' : '')); return; }
  queueIndex = index; queueStop.disabled = false; updateQueueLabel();
  queuePlayer.src = records[index].url;
  try { await queuePlayer.play(); }
  catch (_) { if (queueIndex === index) { queueButton.textContent = 'Reprendre'; queueStatus.textContent += ' — Cliquez sur Reprendre pour lancer la lecture.'; } }
}
function syncTimelinePlay() {
  if (!timelinePlay || !queuePlayer) return;
  timelinePlay.textContent = queuePlayer.paused ? '▶ Lecture' : 'Ⅱ Pause';
  timelinePlay.setAttribute('aria-label', queuePlayer.paused ? 'Lire l’audio complet' : 'Mettre en pause');
  timelinePlay.setAttribute('aria-pressed', String(!queuePlayer.paused));
}
function updateTimeline() {
  if (!mergedPlayback) return;
  const position = timelinePosition(mergedPlayback.markers, queuePlayer.currentTime);
  if (!position) return;
  queueIndex = position.marker.index;
  timelineRange.value = String(position.seconds);
  const clock = Number.isFinite(position.time) ? new Date(position.time).toLocaleString('fr-FR', {hour12:false}) : 'Heure inconnue';
  timelineClock.textContent = clock;
  const r = records[queueIndex];
  queueStatus.textContent = 'Audio complet · ' + clock + ' · ' + groupLabel(r) + ' · ' + r.user + (mergedPlayback.failures ? ' · Lecture partielle : ' + mergedPlayback.failures + ' indisponibles' : '');
}
function installMergedPlayback(blob, markers, failures) {
  stopQueue();
  const url = createOutputURL(blob);
  mergedPlayback = {url, markers, failures};
  queuePlayer.src = url; queuePlayer.currentTime = 0; queueIndex = markers[0].index;
  timelineRange.max = String(markers[markers.length-1].end); timelineRange.value = '0';
  timeline.hidden = false; listeningControls.hidden = true; queueStatus.hidden = true; queueStop.disabled = false; syncTimelinePlay();
  updateTimeline();
}
