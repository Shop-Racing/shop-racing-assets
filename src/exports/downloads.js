// Récupération des médias et téléchargements.
// Assemblé dans la même fermeture privée : voir README.md.
function filename(r, index, type) {
  const ext = /mpeg|mp3/i.test(type) ? 'mp3' : /wav/i.test(type) ? 'wav' : /ogg/i.test(type) ? 'ogg' : /mp4|m4a/i.test(type) ? 'm4a' : /aac/i.test(type) ? 'aac' : /webm/i.test(type) ? 'webm' : 'audio';
  const t = new Date(r.time), pad = n => String(n).padStart(2, '0');
  const date = Number.isFinite(r.time) ? t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + '_' + pad(t.getHours()) + 'h' + pad(t.getMinutes()) + 'm' + pad(t.getSeconds()) + 's' : 'date-inconnue';
  // Use only neutral labels in exported filenames, never hostnames or remote basenames.
  return safeName(String(index + 1).padStart(5, '0') + '_' + date + '_' + r.group + '_' + r.user) + '.' + ext;
}
async function audioBytes(r, signal, remaining, forPlayback) {
  if (!r.downloadURL && !r.url) throw new Error('Lien audio indisponible.');
  const u = new URL(forPlayback ? (r.url || r.downloadURL) : (r.downloadURL || r.url)), same = u.origin === location.origin;
  const response = await fetch(u, { mode: 'cors', credentials: same ? 'same-origin' : 'omit', signal, redirect: 'error' });
  if (!response.ok || response.type === 'opaque') throw new Error('Audio inaccessible.');
  const type = response.headers.get('content-type') || '';
  if (/text\/|json|xml|html/i.test(type)) throw new Error('Le serveur a renvoyé une réponse non audio.');
  if (Number(response.headers.get('content-length')) > remaining) throw new Error('Limite mémoire atteinte.');
  if (!response.body || !response.body.getReader) throw new Error('Lecture progressive non prise en charge par ce navigateur.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > remaining) { await reader.cancel(); throw new Error('Limite mémoire atteinte.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('Audio vide.');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return { bytes, type };
}
function createOutputURL(blob) { const url = URL.createObjectURL(blob); outputURLs.add(url); return url; }
function revokeOutputURL(url) { URL.revokeObjectURL(url); outputURLs.delete(url); }
function download(blob, name) {
  const url = createOutputURL(blob), a = el('a', null, document.body);
  a.href = url; a.download = name; a.click(); a.remove(); setTimeout(() => revokeOutputURL(url), 60000);
}
