// Tableau des enregistrements.
// Assemblé dans la même fermeture privée : voir README.md.
function renderRows() {
  tbody.replaceChildren(); const fragment = document.createDocumentFragment();
  records.forEach((r, i) => {
    const tr = el('tr', null, fragment);
    el('td', Number.isFinite(r.time) ? new Date(r.time).toLocaleString('fr-FR') : 'Date inconnue', tr);
    el('td', groupLabel(r), tr).title = r.group; el('td', r.user, tr);
    const cell = el('td', null, tr);
    if (r.url) {
      const audio = el('audio', null, cell); audio.controls = true; audio.preload = 'none'; audio.src = r.url;
      audio.setAttribute('aria-label', 'Écouter l’audio ' + (i + 1));
      audio.onplay = () => stopQueue();
      audio.addEventListener('error', () => { const note = cell.querySelector('span') || el('span', '', cell); note.textContent = 'Lecture indisponible.'; });
    } else el('span', 'Lien indisponible', cell);
    const save = el('button', 'Télécharger', el('td', null, tr)); save.disabled = !r.downloadURL && !r.url;
    save.onclick = async () => {
      if (busy) return; setBusy(true); controller = new AbortController(); save.disabled = true;
      try { const f = await audioBytes(r, controller.signal, MAX_BYTES); download(new Blob([f.bytes], { type: f.type }), filename({ ...r, group: groupLabel(r) }, i, f.type)); message('Téléchargement demandé au navigateur.'); }
      catch (_) { message('Téléchargement impossible ou annulé. Le serveur peut bloquer l’accès CORS ; aucun fichier n’a été créé.'); }
      finally { save.disabled = false; setBusy(false); }
    };
  }); tbody.appendChild(fragment);
}
