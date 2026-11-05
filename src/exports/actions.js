// Fusion WAV et export ZIP avec progression.
// Assemblé dans la même fermeture privée : voir README.md.
async function exportMerged(playback = false) {
  if (busy || !complete || !records.length) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) { message('La fusion audio n’est pas prise en charge par ce navigateur.'); return; }
  setBusy(true); controller = new AbortController(); const signal = controller.signal;
  let context;
  try {
    context = new Audio({ sampleRate: 24000 });
    if (context.resume) await context.resume();
    const chunks = [], mergedRecords = [], markers = []; let size = 0, failures = 0, duration = 0;
    progress.max = records.length; progress.value = 0;
    for (let i = 0; i < records.length; i++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      message('Fusion audio : ' + (i + 1) + '/' + records.length + '…');
      try {
        const file = await audioBytes(records[i], signal, MAX_BYTES, true);
        const decoded = await context.decodeAudioData(file.bytes.buffer);
        if (decoded.length * 2 + size > MAX_BYTES) throw new RangeError('Fusion limitée à 512 Mo. Exportez une période plus courte.');
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const pcm = monoPCM(decoded);
        if (!pcm.length) throw new Error('Audio vide');
        const end = duration + pcm.length / 2 / context.sampleRate;
        markers.push({start:duration,end,index:i,time:records[i].time}); duration = end;
        chunks.push(pcm); mergedRecords.push(records[i]); size += pcm.length;
      } catch (e) { if (signal.aborted || e instanceof RangeError) throw e; failures++; }
      progress.value = i + 1;
    }
    if (!chunks.length) { message('Aucun audio décodable : accès CORS ou format non pris en charge. Aucun fichier créé.'); return; }
    const blob = new Blob([wavHeader(size, context.sampleRate), ...chunks], { type: 'audio/wav' });
    installMergedPlayback(blob, markers, failures);
    const name = 'Shop-Racing_' + recordingDates(mergedRecords) + '_' + safeName(scopeTitle()) + '_Echanges-chronologiques' + (failures ? '_PARTIEL' : '') + '.wav';
    message('Audio unique prêt : ' + chunks.length + '/' + records.length + (failures ? ' · ' + failures + ' échecs : fichier partiel.' : ''));
    const save = el('button', 'Télécharger l’audio unique', status), url = createOutputURL(blob);
    save.onclick = () => {
      const a = el('a', null, document.body); a.href = url; a.download = name; a.click(); a.remove(); save.disabled = true;
      message('Téléchargement de l’audio unique demandé au navigateur. Vérifiez vos téléchargements.');
      setTimeout(() => revokeOutputURL(url), 60000);
    };
    setTimeout(() => { revokeOutputURL(url); if (save.isConnected) { save.disabled = true; save.textContent = 'Fichier expiré — relancez la fusion'; } }, 600000);
    if (playback) {
      try { await queuePlayer.play(); }
      catch (_) { queueButton.textContent = 'Reprendre'; message('Audio prêt. Cliquez sur Lecture.'); }
    }
  } catch (e) { message(signal.aborted ? 'Fusion annulée.' : (e instanceof RangeError ? e.message : 'Fusion impossible. Aucun téléchargement demandé.')); }
  finally { if (context) await context.close().catch(() => {}); setBusy(false); }
}
async function exportZip() {
  if (busy || !complete || !records.length) return;
  setBusy(true); controller = new AbortController(); const signal = controller.signal;
  const files = [], failures = []; let size = 0; let preparedURL = null;
  try {
    progress.max = records.length; progress.value = 0;
    for (let i = 0; i < records.length; i++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      message('Préparation du ZIP : ' + (i + 1) + '/' + records.length + '…');
      try {
        const f = await audioBytes(records[i], signal, MAX_BYTES - size); size += f.bytes.length;
        files.push({ name: filename({ ...records[i], group: groupLabel(records[i]) }, i, f.type), bytes: f.bytes });
      } catch (e) { if (signal.aborted) throw e; failures.push(i + 1); }
      progress.value = i + 1;
    }
    if (!files.length) { message('Aucun audio récupéré. Accès refusé, liens expirés ou blocage CORS : aucun ZIP créé.'); return; }
    const blob = makeZip(files);
    const name = 'Shop-Racing-Historique-Audio_' + safeName(scopeTitle()) + (failures.length ? '-partiel' : '') + '.zip';
    // A separate user click after preparation permits a real save and avoids claiming success early.
    const save = el('button', 'Télécharger le ZIP (' + files.length + ' audios)', status);
    preparedURL = createOutputURL(blob);
    message('ZIP prêt : ' + files.length + '/' + records.length + ' audios.' + (failures.length ? ' ' + failures.length + ' échecs (accès/CORS/volume). Archive partielle.' : '') + ' Cliquez pour le télécharger.');
    status.appendChild(save);
    const url = preparedURL;
    save.onclick = () => {
      const a = el('a', null, document.body); a.href = url; a.download = name; a.click(); a.remove();
      save.disabled = true;
      message('Téléchargement du ZIP demandé au navigateur (' + files.length + '/' + records.length + ' audios). Vérifiez vos téléchargements.');
      setTimeout(() => revokeOutputURL(url), 60000);
    };
    setTimeout(() => { revokeOutputURL(url); if (save.isConnected) { save.disabled = true; save.textContent = 'ZIP expiré — relancez l’export'; } }, 10 * 60000);
  } catch (_) { if (preparedURL) revokeOutputURL(preparedURL); message(signal.aborted ? 'Export annulé : aucun téléchargement demandé.' : 'Création du ZIP impossible : aucun téléchargement demandé.'); }
  finally { setBusy(false); }
}
