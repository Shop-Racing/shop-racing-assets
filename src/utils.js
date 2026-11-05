// Noms, licences, dates et navigation temporelle.
// Assemblé dans la même fermeture privée : voir README.md.
function groupPath(path) {
  if (!AUDIO_PATH.test(path)) throw new Error('Adresse audio non reconnue.');
  return path.replace(/(\/ptt\/)audio((?:;jsessionid=[^/;]+)?\/?)$/i, '$1group$2');
}
function loginRoute(href) {
  try {
    const u = new URL(href, 'https://example.invalid');
    return [u.pathname, u.hash.slice(1).split('?')[0]].some(path => /(?:^|\/)(?:login|log-in|signin|sign-in|connexion)(?:\/|$)/i.test(path));
  } catch (_) { return false; }
}
function safeName(value) {
  let s = String(value || 'audio').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+|[. ]+$/g, '').slice(0, 100);
  if (!s || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)) s = 'audio_' + s;
  return s;
}
function roleLicense(name) {
  const s = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const m = /^(VOITURE|INGENIEUR|MECANICIEN|MECANO)[\s_:#-]*(\d+)\s*$/.exec(s);
  return m ? { role: m[1], license: m[2] } : null;
}
function dropdownGroup(text) {
  const match = /^\s*(.*?)\s*\((\d+)\)\s*$/.exec(String(text || ''));
  const parsed = match && roleLicense(match[1]);
  return match && match[1].trim() ? { id: match[2], label: parsed ? parsed.role + ' ' + parsed.license : match[1].trim(), ...(parsed || {}) } : null;
}
function timelinePosition(markers, seconds) {
  if (!markers.length) return null;
  const t = Math.max(0, Math.min(Number(seconds) || 0, markers[markers.length - 1].end));
  const marker = markers.find(m => t < m.end) || markers[markers.length - 1];
  return { marker, seconds: t, time: Number.isFinite(marker.time) ? marker.time + Math.max(0,t-marker.start)*1000 : NaN };
}
function timelineSeek(markers, time) {
  for (const marker of markers) {
    if (!Number.isFinite(marker.time)) continue;
    if (time <= marker.time) return marker.start;
    if (time < marker.time + (marker.end-marker.start)*1000) return marker.start + (time-marker.time)/1000;
  }
  return markers.length ? markers[markers.length-1].end : 0;
}
function timestamp(value) {
  if (value == null || value === '') return NaN;
  if (/^\d+(?:\.\d+)?$/.test(String(value))) {
    const n = Number(value); return n < 1e12 ? n * 1000 : n;
  }
  return Date.parse(String(value).replace(' ', 'T'));
}
function recordingDates(items) {
  const pad = n => String(n).padStart(2, '0');
  const dates = Array.from(new Set(items.filter(r => Number.isFinite(r.time)).map(r => {
    const d = new Date(r.time); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }))).sort();
  return !dates.length ? 'Date-inconnue' : dates.length === 1 ? dates[0] : dates[0] + '_au_' + dates[dates.length - 1];
}
function searchDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3] || d.getHours() !== +m[4] || d.getMinutes() !== +m[5] || d.getSeconds() !== +(m[6] || 0)) return null;
  return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + (m[6] || '00');
}
