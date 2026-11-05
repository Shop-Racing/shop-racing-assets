// Requêtes audio et chargement des groupes autorisés.
// Assemblé dans la même fermeture privée : voir README.md.
function setBusy(value) {
  busy = value; loadButton.disabled = value; zipButton.disabled = value || !complete || !records.length;
  dateInput.disabled = value; scopeSelect.disabled = value; groupSelect.disabled = value;
  mergeButton.disabled = value || !complete || !records.length;
  queueButton.disabled = value || !complete || !records.some(r => r.url);
  licence.disabled = value; licenceToggle.disabled = value; if (value) showLicenceMenu(false); cancelButton.hidden = !value;
}
function message(text) { status.textContent = text; }
async function jsonRequest(url, headers, signal) {
  const generation = authGeneration;
  if (isLoginPage()) throw new DOMException("Session ended", "AbortError");
  const timed = new AbortController();
  activeRequests.add(timed);
  const abort = () => timed.abort(); signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) timed.abort();
  let expired = false;
  const timer = setTimeout(() => { expired = true; timed.abort(); }, 30000);
  try {
  const opts = { credentials: 'include', signal: timed.signal, method: sessionMethod };
  if (sessionMethod === 'POST') {
    opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };
    opts.body = url.searchParams.toString();
  }
  const r = await nativeFetch(url, opts);
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Session expirée ou accès refusé.' : r.status === 503 ? 'Serveur temporairement indisponible (503). Réessayez lorsque la recherche audio habituelle fonctionne.' : 'Erreur serveur pendant le chargement (HTTP ' + r.status + ').');
  let payload;
  try { payload = await r.json(); } catch (_) { throw new Error('Réponse serveur non JSON. Rouvrez les archives natives.'); }
  if (generation !== authGeneration || isLoginPage()) throw new DOMException('Session ended', 'AbortError');
  return payload;
  } catch (e) {
    if (expired) throw new Error('Le serveur ne répond pas depuis 30 secondes. Réessayez après une recherche audio habituelle.');
    if (e instanceof TypeError || e.name === 'TypeError') throw new Error('Connexion au serveur refusée ou bloquée. Relancez une recherche audio habituelle pour détecter la session.');
    throw e;
  } finally { activeRequests.delete(timed); clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
function mediaURL(value, base) {
  if (typeof value !== 'string' || !value) return null;
  try { const u = new URL(value, base); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch (_) { return null; }
}
function normalizeAudio(a, group, base) {
  const id = a.id ?? a.audio_id ?? a.audioId;
  if (id == null) throw new Error('Un audio ne possède pas d’identifiant : dédoublonnage impossible.');
  const url = mediaURL(a.play_url ?? a.audio_url ?? a.file_url ?? a.download_url ?? a.url ?? a.path ?? a.file, base);
  const downloadURL = mediaURL(a.download_url, base) || url;
  const time = timestamp(a.create_time ?? a.created_at ?? a.start_time ?? a.time ?? a.timestamp ?? a.date);
  const user = a.user_name ?? a.username ?? a.userName ?? a.name ?? a.user_id ?? 'Utilisateur';
  return { id: String(id), url, downloadURL, time, user: String(user), group };
}
async function load() {
  if (busy) return;
  stopQueue();
  const singleGroup = scopeSelect.value === 'group';
  const selectedGroup = singleGroup && availableGroups.get(groupSelect.value);
  const number = licence.value.trim();
  if (singleGroup && !selectedGroup) { message('Choisissez le groupe à écouter.'); groupSelect.focus(); return; }
  if (!singleGroup && !/^\d+$/.test(number)) { message('Saisissez un numéro de licence composé de chiffres.'); licence.focus(); return; }
  const chosenDate = searchDate(dateInput.value);
  if (!chosenDate) { message('Choisissez une date et une heure valides pour la recherche.'); dateInput.focus(); return; }
  {
    setBusy(true);
    try {
      await ensureAudioPage();
      const allowed = dropdownGroups();
      offerLicences(Array.from(allowed.values()));
      if (singleGroup ? !allowed.has(selectedGroup.id) : !Array.from(allowed.values()).some(g => g.license === number)) {
        message(singleGroup ? 'Ce groupe ne figure pas dans les groupes accessibles à votre compte.' : 'Aucun groupe correspondant à cette licence dans les groupes accessibles à votre compte.');
        return;
      }
      await detectWithNativeQuery(true, chosenDate, singleGroup ? null : number, selectedGroup?.id);
    } catch (e) { message(e.message || 'Impossible de vérifier les groupes accessibles.'); return; }
    finally { setBusy(false); }
  }
  if (nativeQueryIssue) { message(nativeQueryIssue); return; }
  if (!sessionURL) {
    const raw = queryBox.querySelector('input').value.trim();
    if (!raw) { queryBox.hidden = false; message('Session non détectée : fermez cette fenêtre, ouvrez les enregistrements audio habituels du portail et lancez une recherche. Revenez ensuite ici et cliquez sur Charger les archives. Query reste une solution de secours.'); return; }
    let manual;
    try { manual = raw.startsWith('?') || !raw.includes('://') ? new URL('/ptt/audio?' + raw.replace(/^\?/, ''), location.origin) : audioRequest(raw); }
    catch (_) { message('Query invalide.'); return; }
    if (!manual || !manual.search) { message('Query invalide. Utilisez uniquement la requête audio de ce portail.'); return; }
    capture(manual);
  }
  loadedScope = singleGroup ? { kind: 'group', group: selectedGroup.label } : { kind: 'licence', number };
  complete = false; records = []; tbody.replaceChildren(); setBusy(true);
  controller = new AbortController(); const signal = controller.signal;
  const base = new URL(sessionURL), headers = { ...capturedHeaders };
  base.searchParams.set('start_time', chosenDate);
  let stage = 'Recherche des groupes accessibles';
  try {
    const allowed = dropdownGroups();
    offerLicences(Array.from(allowed.values()));
    candidates.clear();
    for (const g of allowed.values()) if (singleGroup ? g.id === selectedGroup.id : g.license === number)
      candidates.set(g.id, {id:g.id,label:g.label});
    if (!candidates.size) { complete = true; message(singleGroup ? 'Ce groupe n’est plus disponible.' : 'Aucun groupe correspondant à cette licence.'); return; }
    const unique = new Map(); let index = 0;
    for (const g of candidates.values()) {
      stage = 'Chargement des audios de ' + g.label;
      index++; message('Chargement du groupe ' + index + '/' + candidates.size + '…');
      // The audio action belongs to the captured session (for example getByUser).
      // Changing it to the group API's action can change permissions or hit another backend route.
      const u = new URL(base); u.searchParams.set('group_id', g.id);
      u.searchParams.set('order_type', 'desc');
      let rows;
      try { rows = await portalPages(u, 'audio', x => {
        const cached = nativeAudioResult;
        const same = cached && x.origin === cached.url.origin && x.pathname === cached.url.pathname &&
          Array.from(new Set([...x.searchParams.keys(), ...cached.url.searchParams.keys()])).every(key =>
            x.searchParams.get(key) === cached.url.searchParams.get(key));
        return same ? Promise.resolve(cached.payload) : jsonRequest(x, headers, signal);
      }, n => message(g.label + ' : ' + n + ' audios reçus…')); }
      catch (e) {
        for (const a of e.partialRows || []) { const r = normalizeAudio(a, g.label, base); if (!unique.has(r.id)) unique.set(r.id, r); }
        records = Array.from(unique.values()); throw e;
      }
      for (const a of rows) { const r = normalizeAudio(a, g.label, base); if (!unique.has(r.id)) unique.set(r.id, r); }
      records = Array.from(unique.values());
    }
    records.sort((a, b) => (Number.isFinite(a.time) ? a.time : Infinity) - (Number.isFinite(b.time) ? b.time : Infinity) || a.id.localeCompare(b.id));
    renderRows(); complete = true;
    const missing = records.filter(r => !r.url).length;
    message(records.length + ' audios à partir du ' + chosenDate + ', du plus ancien au plus récent.' + (missing ? ' ' + missing + ' sans lien exploitable.' : ''));
  } catch (e) {
    if (signal.aborted) { records = []; tbody.replaceChildren(); message('Chargement annulé.'); }
    else {
      records.sort((a, b) => (Number.isFinite(a.time) ? a.time : Infinity) - (Number.isFinite(b.time) ? b.time : Infinity) || a.id.localeCompare(b.id));
      renderRows();
      message(stage + ' : ' + e.message + (records.length ? ' Résultats incomplets : ' + records.length + ' audios affichés. Exports désactivés.' : ''));
    }
  } finally { progress.value = 0; setBusy(false); }
}
