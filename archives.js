/* Shop-Racing Archives audio. No credentials are stored or sent outside this session. */
(function () {
  'use strict';
  const VERSION = '1.0.5';
  const MAX_BYTES = 512 * 1024 * 1024;
  const AUDIO_PATH = /\/ptt\/audio(?:;jsessionid=[^/;]+)?\/?$/i;
  function groupPath(path) {
    if (!AUDIO_PATH.test(path)) throw new Error('Adresse audio non reconnue.');
    return path.replace(/(\/ptt\/)audio((?:;jsessionid=[^/;]+)?\/?)$/i, '$1group$2');
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
  function timestamp(value) {
    if (value == null || value === '') return NaN;
    if (/^\d+(?:\.\d+)?$/.test(String(value))) {
      const n = Number(value); return n < 1e12 ? n * 1000 : n;
    }
    return Date.parse(String(value).replace(' ', 'T'));
  }
  const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
  }
  // ZIP32, STORE method, UTF-8 names, CRC32, local headers + central directory + EOCD.
  function makeZip(files) {
    if (!files.length || files.length > 65535) throw new Error('Nombre de fichiers ZIP non pris en charge.');
    const local = [], central = []; let offset = 0, centralSize = 0;
    for (const f of files) {
      const name = new TextEncoder().encode(safeName(f.name));
      const bytes = f.bytes;
      if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES || offset + bytes.length > MAX_BYTES)
        throw new Error('Archive trop volumineuse (limite 512 Mo).');
      const crc = crc32(bytes);
      const h = new Uint8Array(30 + name.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true);
      v.setUint16(12, 33, true); v.setUint32(14, crc, true); v.setUint32(18, bytes.length, true);
      v.setUint32(22, bytes.length, true); v.setUint16(26, name.length, true); h.set(name, 30);
      const c = new Uint8Array(46 + name.length), d = new DataView(c.buffer);
      d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true);
      d.setUint16(8, 0x800, true); d.setUint16(14, 33, true); d.setUint32(16, crc, true);
      d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true);
      d.setUint16(28, name.length, true); d.setUint32(42, offset, true); c.set(name, 46);
      local.push(h, bytes); central.push(c); offset += h.length + bytes.length; centralSize += c.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    return new Blob([...local, ...central, end], { type: 'application/zip' });
  }
  function listEnvelope(payload, kind) {
    if (Array.isArray(payload)) return { rows: payload, meta: {} };
    if (!payload || typeof payload !== 'object') throw new Error('Réponse serveur non reconnue.');
    if (payload.success === false || payload.error || (payload.code != null && ![0, 200, '0', '200'].includes(payload.code)))
      throw new Error('La session ou la requête a été refusée. Ouvrez les archives natives puis réessayez.');
    const keys = kind === 'group' ? ['groups', 'group', 'list', 'rows', 'records', 'items'] : ['audios', 'audio', 'list', 'rows', 'records', 'items'];
    const containers = [payload, payload.data, payload.result].filter(x => x && typeof x === 'object');
    for (const x of containers) {
      if (Array.isArray(x)) return { rows: x, meta: { ...payload } };
      for (const key of keys) if (Array.isArray(x[key])) return { rows: x[key], meta: { ...payload, ...x } };
    }
    throw new Error('Format de liste non reconnu : chargement interrompu, aucun résultat complet annoncé.');
  }
  async function paginate(base, kind, request, progress) {
    const result = [], seen = new Set();
    const params = base.searchParams;
    const pageKey = ['page', 'page_no', 'pageNum', 'pageIndex'].find(k => params.has(k)) || 'page';
    const sizeKey = ['limit', 'page_size', 'pageSize', 'rows', 'size'].find(k => params.has(k)) || 'limit';
    const size = Math.min(500, Math.max(1, Number(params.get(sizeKey)) || 100));
    const useOffset = params.has('offset') || params.has('start');
    const offsetKey = params.has('start') ? 'start' : 'offset';
    const zeroBased = params.get(pageKey) === '0';
    for (let page = 0; page < 10000; page++) {
      const u = new URL(base); u.searchParams.set(sizeKey, String(size));
      if (useOffset) u.searchParams.set(offsetKey, String(result.length));
      else u.searchParams.set(pageKey, String(page + (zeroBased ? 0 : 1)));
      const { rows, meta } = listEnvelope(await request(u), kind);
      if (!rows.length) {
        const total = Number(meta.total ?? meta.total_count);
        if ((Number.isFinite(total) && total > result.length) || meta.has_more === true || meta.hasMore === true)
          throw new Error('Pagination incomplète : page vide avant la fin.');
        return result;
      }
      const signature = JSON.stringify(rows);
      if (seen.has(signature)) throw new Error('Le serveur répète une page : chargement incomplet.');
      seen.add(signature); result.push(...rows); if (progress) progress(result.length);
      const total = Number(meta.total ?? meta.total_count);
      const pages = Number(meta.total_pages ?? meta.pages);
      if (Number.isFinite(total) && total >= 0 && result.length >= total) return result;
      if (Number.isFinite(pages) && pages > 0 && page + 1 >= pages) return result;
      if (meta.has_more === false || meta.hasMore === false) return result;
      // Without reliable totals, fetch until an empty page. Never assume the server honors our size.
    }
    throw new Error('Limite de pagination atteinte : chargement incomplet.');
  }
  if (typeof window === 'undefined' && typeof module === 'object' && module.exports) {
    module.exports = { safeName, roleLicense, timestamp, crc32, makeZip, listEnvelope, paginate, AUDIO_PATH, groupPath }; return;
  }
  if (window.__shopRacingArchives && typeof window.__shopRacingArchives.restore === 'function') {
    window.__shopRacingArchives.restore(); return;
  }
  if (document.getElementById('shop-racing-archives')) return;
  window.__shopRacingArchives = { version: VERSION };
  let sessionURL = null, capturedHeaders = {}, sessionMethod = 'GET', sessionCredentials = 'same-origin';
  let records = [], busy = false, complete = false, controller;
  let panel, status, queryBox, loadButton, zipButton, tbody, licence, progress, cancelButton;
  let portalHost, restoreObserver, waitingForBody = false;
  const candidates = new Map();
  function audioRequest(value, observed) {
    try {
      const u = new URL(String(value), location.href);
      return (observed || u.origin === location.origin) && /^https?:$/.test(u.protocol) &&
        !u.username && !u.password && AUDIO_PATH.test(u.pathname) ? u : null;
    } catch (_) { return null; }
  }
  function capture(value, headers, method, body, credentials, observed) {
    const u = audioRequest(value, observed); if (!u) return;
    const verb = String(method || 'GET').toUpperCase(); if (!['GET', 'POST'].includes(verb)) return;
    // Reuse form parameters only. Never inspect unrelated requests or persistent storage.
    if (verb === 'POST' && body != null) {
      let pairs;
      if (typeof body === 'string') {
        if (/^\s*[\[{]/.test(body)) return; // JSON replay requires an explicit endpoint adapter.
        pairs = new URLSearchParams(body);
      } else if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) pairs = body;
      else if (typeof FormData !== 'undefined' && body instanceof FormData) {
        pairs = body; for (const [, v] of pairs) if (typeof v !== 'string') return;
      } else return;
      for (const [k, v] of pairs) u.searchParams.set(k, v);
    }
    sessionURL = u; capturedHeaders = { ...(headers || {}) };
    sessionMethod = verb; sessionCredentials = credentials === 'include' ? 'include' : 'same-origin';
    if (queryBox) { queryBox.hidden = true; queryBox.querySelector('input').value = ''; }
    if (status && !busy) status.textContent = 'Session détectée. Saisissez la licence puis chargez les archives.';
  }
  const nativeFetch = window.fetch ? window.fetch.bind(window) : fetch;
  function installXHRHook() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;
  const xhrInfo = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, url) {
    const result = originalOpen.apply(this, arguments);
    const u = audioRequest(url, true);
    xhrInfo.set(this, { url: u, method: String(method).toUpperCase(), headers: {} });
    return result;
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    const result = originalSetHeader.apply(this, arguments), info = xhrInfo.get(this);
    if (info && /^(authorization|x-.*token|token|sessionid|x-requested-with)$/i.test(name)) info.headers[name] = String(value);
    return result;
  };
  XMLHttpRequest.prototype.send = function () {
    const info = xhrInfo.get(this);
    try {
      if (info && info.url) capture(info.url, info.headers, info.method, arguments[0], this.withCredentials ? 'include' : 'same-origin', true);
    } catch (_) { /* Always preserve the platform's native request. */ }
    return originalSend.apply(this, arguments);
  };
  }
  function installFetchHook() {
  if (window.fetch) window.fetch = function (input, options) {
    // Observe the platform's request; our own requests use nativeFetch and cannot replace the session.
    try {
      const opts = options || {}, isRequest = typeof Request !== 'undefined' && input instanceof Request;
      const url = isRequest ? input.url : input;
      if (audioRequest(url, true)) {
        const method = opts.method || (isRequest ? input.method : 'GET');
        const headers = {};
        new Headers(opts.headers || (isRequest ? input.headers : undefined)).forEach((v, k) => {
          if (/^(authorization|x-.*token|token|sessionid|x-requested-with)$/i.test(k)) headers[k] = v;
        });
        const credentials = opts.credentials || (isRequest ? input.credentials : 'same-origin');
        if (isRequest && method.toUpperCase() === 'POST' && opts.body === undefined)
          input.clone().text().then(body => capture(url, headers, method, body, credentials, true)).catch(() => {});
        else capture(url, headers, method, opts.body, credentials, true);
      }
    } catch (_) { /* Observation must never break the platform's original request. */ }
    return nativeFetch(input, options);
  };
  }
  const frameConstructors = new WeakSet(), watchedFrames = new WeakSet(), watchedDocuments = new WeakSet();
  const accessibleWindows = new Set([window]);
  function scanFrames(scope) {
    try {
      const doc = scope.document; if (!doc || !doc.querySelectorAll) return;
      accessibleWindows.add(scope);
      const Constructor = scope.XMLHttpRequest;
      if (scope !== window && Constructor && !frameConstructors.has(Constructor)) {
        frameConstructors.add(Constructor);
        const proto = Constructor.prototype, open = proto.open, send = proto.send, setHeader = proto.setRequestHeader;
        const info = new WeakMap();
        proto.open = function (method, url) {
          const result = open.apply(this, arguments);
          let resolved; try { resolved = new URL(String(url), scope.location.href); } catch (_) {}
          info.set(this, { method, url: resolved, headers: {} }); return result;
        };
        proto.setRequestHeader = function (name, value) {
          const result = setHeader.apply(this, arguments), item = info.get(this);
          if (item && /^(authorization|x-.*token|token|sessionid|x-requested-with)$/i.test(name)) item.headers[name] = String(value);
          return result;
        };
        proto.send = function () {
          try {
            const item = info.get(this);
            if (item && item.url) capture(item.url, item.headers, item.method, arguments[0], this.withCredentials ? 'include' : 'same-origin', true);
          } catch (_) {}
          return send.apply(this, arguments);
        };
        if (scope.fetch) {
          const original = scope.fetch.bind(scope);
          scope.fetch = function (input, options) {
            try {
              const opts = options || {}, req = scope.Request && input instanceof scope.Request;
              const url = new URL(String(req ? input.url : input), scope.location.href);
              if (audioRequest(url, true)) {
                const method = opts.method || (req ? input.method : 'GET'), headers = {};
                new Headers(opts.headers || (req ? input.headers : undefined)).forEach((v, k) => {
                  if (/^(authorization|x-.*token|token|sessionid|x-requested-with)$/i.test(k)) headers[k] = v;
                });
                const credentials = opts.credentials || (req ? input.credentials : 'same-origin');
                if (req && method.toUpperCase() === 'POST' && opts.body === undefined)
                  input.clone().text().then(body => capture(url, headers, method, body, credentials, true)).catch(() => {});
                else capture(url, headers, method, opts.body, credentials, true);
              }
            } catch (_) {}
            return original(input, options);
          };
        }
      }
      // Frames may be created or navigated after the OEM script has loaded.
      for (const frame of doc.querySelectorAll('iframe,frame')) {
        if (!watchedFrames.has(frame)) {
          watchedFrames.add(frame); frame.addEventListener('load', () => scanFrames(scope));
        }
        try { scanFrames(frame.contentWindow); } catch (_) {} // Cross-origin documents remain inaccessible.
      }
      if (typeof MutationObserver !== 'undefined' && !watchedDocuments.has(doc)) {
        watchedDocuments.add(doc);
        new MutationObserver(changes => {
          if (changes.some(c => Array.from(c.addedNodes).some(n => n.nodeType === 1 &&
            (n.matches('iframe,frame') || n.querySelector('iframe,frame'))))) scanFrames(scope);
        }).observe(doc, { childList: true, subtree: true });
      }
    } catch (_) { /* Respect browser origin boundaries. */ }
  }
  function discover() {
    scanFrames(window);
    if (sessionURL) return true;
    // Resource timing only, including accessible portal frames; no storage or cookies are scanned.
    for (const scope of accessibleWindows) {
    let entries;
    try { const p = scope.performance || (scope === window ? performance : null); entries = p && p.getEntriesByType ? p.getEntriesByType('resource') : []; }
    catch (_) { continue; }
    for (let i = entries.length - 1; i >= 0; i--) {
      const observed = ['xmlhttprequest', 'fetch'].includes(entries[i].initiatorType);
      const u = audioRequest(entries[i].name, observed); if (u) { capture(u, {}, 'GET', null, 'same-origin', observed); return true; }
    }
    }
    return false;
  }
  function el(tag, text, parent) {
    const node = document.createElement(tag); if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node); return node;
  }
  function setBusy(value) {
    busy = value; loadButton.disabled = value; zipButton.disabled = value || !complete || !records.length;
    licence.disabled = value; cancelButton.hidden = !value;
  }
  function message(text) { status.textContent = text; }
  async function jsonRequest(url, headers, signal) {
    const timed = new AbortController();
    const abort = () => timed.abort(); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) timed.abort();
    let expired = false;
    const timer = setTimeout(() => { expired = true; timed.abort(); }, 30000);
    try {
    const opts = { credentials: sessionCredentials, headers: { ...headers }, signal: timed.signal, cache: 'no-store', method: sessionMethod };
    if (sessionMethod === 'POST') {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
      opts.body = url.searchParams.toString();
    }
    const r = await nativeFetch(url, opts);
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Session expirée ou accès refusé.' : r.status === 503 ? 'Serveur temporairement indisponible (503). Réessayez lorsque la recherche audio habituelle fonctionne.' : 'Erreur serveur pendant le chargement (HTTP ' + r.status + ').');
    try { return await r.json(); } catch (_) { throw new Error('Réponse serveur non JSON. Rouvrez les archives natives.'); }
    } catch (e) {
      if (expired) throw new Error('Le serveur ne répond pas depuis 30 secondes. Réessayez après une recherche audio habituelle.');
      if (e instanceof TypeError) throw new Error('Connexion au serveur refusée ou bloquée. Relancez une recherche audio habituelle pour détecter la session.');
      throw e;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  function mediaURL(value, base) {
    if (typeof value !== 'string' || !value) return null;
    try { const u = new URL(value, base); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; }
    catch (_) { return null; }
  }
  function normalizeAudio(a, group, base) {
    const id = a.id ?? a.audio_id ?? a.audioId;
    if (id == null) throw new Error('Un audio ne possède pas d’identifiant : dédoublonnage impossible.');
    const url = mediaURL(a.audio_url ?? a.file_url ?? a.download_url ?? a.url ?? a.path ?? a.file, base);
    const time = timestamp(a.create_time ?? a.created_at ?? a.start_time ?? a.time ?? a.timestamp ?? a.date);
    const user = a.user_name ?? a.username ?? a.userName ?? a.name ?? a.user_id ?? 'Utilisateur';
    return { id: String(id), url, time, user: String(user), group };
  }
  async function load() {
    if (busy) return;
    const number = licence.value.trim();
    if (!/^\d+$/.test(number)) { message('Saisissez un numéro de licence composé de chiffres.'); licence.focus(); return; }
    discover();
    if (!sessionURL) {
      const raw = queryBox.querySelector('input').value.trim();
      if (!raw) { queryBox.hidden = false; message('Session non détectée : fermez cette fenêtre, ouvrez les enregistrements audio habituels du portail et lancez une recherche. Revenez ensuite ici et cliquez sur Charger les archives. Query reste une solution de secours.'); return; }
      let manual;
      try { manual = raw.startsWith('?') || !raw.includes('://') ? new URL('/ptt/audio?' + raw.replace(/^\?/, ''), location.origin) : audioRequest(raw); }
      catch (_) { message('Query invalide.'); return; }
      if (!manual || !manual.search) { message('Query invalide. Utilisez uniquement la requête audio de ce portail.'); return; }
      capture(manual);
    }
    complete = false; records = []; tbody.replaceChildren(); setBusy(true);
    controller = new AbortController(); const signal = controller.signal;
    const base = new URL(sessionURL), headers = { ...capturedHeaders };
    // Empty group_id reuses the authenticated session without narrowing the group discovery.
    base.searchParams.set('group_id', '');
    const groupURL = new URL(base); groupURL.pathname = groupPath(groupURL.pathname);
    groupURL.searchParams.set('method', 'get');
    for (const key of ['audio_id', 'user_id', 'start_time', 'end_time', 'begin_time', 'start_date', 'end_date', 'date', 'keyword']) {
      groupURL.searchParams.delete(key); base.searchParams.delete(key);
    }
    try {
      message('Recherche de tous les groupes…'); progress.removeAttribute('value');
      const groups = await paginate(groupURL, 'group', u => jsonRequest(u, headers, signal), n => message(n + ' groupes examinés…'));
      candidates.clear();
      for (const g of groups) {
        const parsed = roleLicense(g.name ?? g.group_name ?? g.groupName);
        const id = g.id ?? g.group_id ?? g.groupId;
        if (parsed && parsed.license === number && id != null) candidates.set(String(id), { id: String(id), label: parsed.role + ' ' + parsed.license });
      }
      if (!candidates.size) { complete = true; message('Aucun groupe correspondant à cette licence.'); return; }
      const unique = new Map(); let index = 0;
      for (const g of candidates.values()) {
        index++; message('Chargement du groupe ' + index + '/' + candidates.size + '…');
        // The audio action belongs to the captured session (for example getByUser).
        // Changing it to the group API's action can change permissions or hit another backend route.
        const u = new URL(base); u.searchParams.set('group_id', g.id);
        const rows = await paginate(u, 'audio', x => jsonRequest(x, headers, signal), n => message(g.label + ' : ' + n + ' audios reçus…'));
        for (const a of rows) { const r = normalizeAudio(a, g.label, base); if (!unique.has(r.id)) unique.set(r.id, r); }
        records = Array.from(unique.values());
      }
      records.sort((a, b) => (Number.isFinite(a.time) ? a.time : Infinity) - (Number.isFinite(b.time) ? b.time : Infinity) || a.id.localeCompare(b.id));
      renderRows(); complete = true;
      const missing = records.filter(r => !r.url).length;
      message(records.length + ' audios, du plus ancien au plus récent.' + (missing ? ' ' + missing + ' sans lien exploitable.' : ''));
    } catch (e) {
      records = []; tbody.replaceChildren(); message(signal.aborted ? 'Chargement annulé.' : e.message);
    } finally { progress.value = 0; setBusy(false); }
  }
  function filename(r, index, type) {
    const ext = /mpeg|mp3/i.test(type) ? 'mp3' : /wav/i.test(type) ? 'wav' : /ogg/i.test(type) ? 'ogg' : /mp4|m4a/i.test(type) ? 'm4a' : /aac/i.test(type) ? 'aac' : /webm/i.test(type) ? 'webm' : 'audio';
    const date = Number.isFinite(r.time) ? new Date(r.time).toISOString().replace(/[:.]/g, '-') : 'date-inconnue';
    // Use only neutral labels in exported filenames, never hostnames or remote basenames.
    return safeName(String(index + 1).padStart(5, '0') + '_' + date + '_' + r.group) + '.' + ext;
  }
  async function audioBytes(r, signal, remaining) {
    if (!r.url) throw new Error('Lien audio indisponible.');
    const u = new URL(r.url), same = u.origin === location.origin;
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
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = el('a', null, document.body);
    a.href = url; a.download = name; a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function renderRows() {
    tbody.replaceChildren(); const fragment = document.createDocumentFragment();
    records.forEach((r, i) => {
      const tr = el('tr', null, fragment);
      el('td', Number.isFinite(r.time) ? new Date(r.time).toLocaleString('fr-FR') : 'Date inconnue', tr);
      el('td', r.group, tr); el('td', r.user, tr);
      const cell = el('td', null, tr);
      if (r.url) {
        const audio = el('audio', null, cell); audio.controls = true; audio.preload = 'none'; audio.src = r.url;
        audio.setAttribute('aria-label', 'Écouter l’audio ' + (i + 1));
        audio.addEventListener('error', () => { const note = cell.querySelector('span') || el('span', '', cell); note.textContent = 'Lecture indisponible.'; });
      } else el('span', 'Lien indisponible', cell);
      const save = el('button', 'Télécharger', el('td', null, tr)); save.disabled = !r.url;
      save.onclick = async () => {
        if (busy) return; setBusy(true); controller = new AbortController(); save.disabled = true;
        try { const f = await audioBytes(r, controller.signal, MAX_BYTES); download(new Blob([f.bytes], { type: f.type }), filename(r, i, f.type)); message('Téléchargement demandé au navigateur.'); }
        catch (_) { message('Téléchargement impossible ou annulé. Le serveur peut bloquer l’accès CORS ; aucun fichier n’a été créé.'); }
        finally { save.disabled = false; setBusy(false); }
      };
    }); tbody.appendChild(fragment);
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
          files.push({ name: filename(records[i], i, f.type), bytes: f.bytes });
        } catch (e) { if (signal.aborted) throw e; failures.push(i + 1); }
        progress.value = i + 1;
      }
      if (!files.length) { message('Aucun audio récupéré. Accès refusé, liens expirés ou blocage CORS : aucun ZIP créé.'); return; }
      const blob = makeZip(files);
      const name = 'Shop-Racing-Archives-' + safeName(licence.value) + (failures.length ? '-partiel' : '') + '.zip';
      // A separate user click after preparation permits a real save and avoids claiming success early.
      const save = el('button', 'Télécharger le ZIP (' + files.length + ' audios)', status);
      preparedURL = URL.createObjectURL(blob);
      message('ZIP prêt : ' + files.length + '/' + records.length + ' audios.' + (failures.length ? ' ' + failures.length + ' échecs (accès/CORS/volume). Archive partielle.' : '') + ' Cliquez pour le télécharger.');
      status.appendChild(save);
      const url = preparedURL;
      save.onclick = () => {
        const a = el('a', null, document.body); a.href = url; a.download = name; a.click(); a.remove();
        save.disabled = true;
        message('Téléchargement du ZIP demandé au navigateur (' + files.length + '/' + records.length + ' audios). Vérifiez vos téléchargements.');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      };
      setTimeout(() => { URL.revokeObjectURL(url); if (save.isConnected) { save.disabled = true; save.textContent = 'ZIP expiré — relancez l’export'; } }, 10 * 60000);
    } catch (_) { if (preparedURL) URL.revokeObjectURL(preparedURL); message(signal.aborted ? 'Export annulé : aucun téléchargement demandé.' : 'Création du ZIP impossible : aucun téléchargement demandé.'); }
    finally { setBusy(false); }
  }
  function mount() {
    if (!document.body) {
      if (!waitingForBody) { waitingForBody = true; document.addEventListener('DOMContentLoaded', mount, { once: true }); }
      return;
    }
    if (portalHost) {
      if (!portalHost.isConnected) document.body.appendChild(portalHost);
      return;
    }
    const old = document.getElementById('srbtn'); if (old) old.remove();
    const host = el('div', null, document.body); portalHost = host; host.id = 'shop-racing-archives';
    host.style.cssText = 'position:fixed!important;display:block!important;visibility:visible!important;opacity:1!important;top:20px!important;right:20px!important;z-index:2147483647!important';
    const root = host.attachShadow({ mode: 'closed' });
    const style = el('style', null, root);
    style.textContent = ':host{font:14px system-ui,sans-serif;color:#edf0f7}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:0;border-radius:9px;padding:11px 16px;background:#f57920;color:#131722;font-weight:700}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid #8ebaff;outline-offset:3px}dialog{color:#edf0f7;background:#151b28;border:1px solid #414b60;border-radius:18px;width:min(1160px,94vw);max-height:90vh;padding:24px}dialog::backdrop{background:#000a}header,.tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap}header{justify-content:space-between}h2{margin:0;font-size:24px}p{color:#b8c4d8}input{border:1px solid #526078;border-radius:8px;padding:10px;background:#0d121d;color:white;max-width:100%}label{display:flex;gap:8px;align-items:center;flex-wrap:wrap}details{margin:16px 0}details input{width:100%;margin-top:8px}progress{width:100%;height:6px;accent-color:#f57920;margin:12px 0}.table{overflow:auto;max-height:52vh}table{border-collapse:collapse;width:100%;text-align:left}th{background:#202a3d;position:sticky;top:0}th,td{padding:12px;border-bottom:1px solid #303a50;white-space:nowrap}audio{width:260px;height:36px}#status{white-space:pre-wrap;overflow-wrap:anywhere;min-height:40px}#status button{margin-left:12px}small{color:#b8c4d8}';
    const launch = el('button', 'ARCHIVES AUDIO', root); launch.setAttribute('aria-haspopup', 'dialog');
    panel = el('dialog', null, root); panel.setAttribute('aria-label', 'Shop-Racing Archives audio');
    const header = el('header', null, panel); el('h2', 'Shop-Racing · Archives audio', header);
    const close = el('button', 'Fermer', header);
    const closePanel = () => { root.querySelectorAll('audio').forEach(a => a.pause()); panel.close(); launch.focus(); };
    close.onclick = closePanel; panel.addEventListener('cancel', e => { e.preventDefault(); closePanel(); });
    el('p', 'Retrouvez les échanges de votre licence, du plus ancien au plus récent.', panel);
    el('small', 'Version ' + VERSION, panel);
    const tools = el('div', null, panel); tools.className = 'tools';
    const label = el('label', 'Licence', tools); licence = el('input', null, label); licence.inputMode = 'numeric'; licence.placeholder = 'Numéro de licence';
    loadButton = el('button', 'Charger les archives', tools); loadButton.onclick = load;
    zipButton = el('button', 'Exporter tous les audios en ZIP', tools); zipButton.disabled = true; zipButton.onclick = exportZip;
    cancelButton = el('button', 'Annuler', tools); cancelButton.hidden = true; cancelButton.onclick = () => controller && controller.abort();
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
      if (!panel.open) panel.showModal(); discover();
      if (!busy && !records.length) message(sessionURL ? 'Session détectée. Saisissez votre licence.' : 'Ouvrez une recherche audio dans le portail, puis cliquez sur Charger les archives.');
      licence.focus();
    };
    // Keep the same UI and in-memory session when the SPA replaces its page or body.
    if (typeof MutationObserver !== 'undefined') {
      restoreObserver = new MutationObserver(() => {
        if (document.body && !host.isConnected) document.body.appendChild(host);
      });
      restoreObserver.observe(document.documentElement || document, { childList: true, subtree: true });
    }
  }
  window.__shopRacingArchives.restore = mount;
  // Display first: a blocked network hook must never prevent access to the portal.
  mount();
  let hookFailed = false;
  try { installXHRHook(); } catch (_) { hookFailed = true; }
  try { installFetchHook(); } catch (_) { hookFailed = true; }
  try { discover(); } catch (_) { hookFailed = true; }
  if (hookFailed && status) message('La détection automatique est limitée dans ce navigateur. Lancez une recherche audio habituelle, puis chargez les archives.');
})();
