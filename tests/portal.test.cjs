process.chdir(require('node:path').resolve(__dirname, '..'));
require('node:fs').mkdirSync('.test-output', {recursive:true});
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.value = ''; this._text = ''; this.disabled = false; }
  set textContent(v) { this._text = v; this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  appendChild(c) { if (c.parent) c.parent.children = c.parent.children.filter(x => x !== c); c.parent = this; this.children.push(c); return c; }
  get isConnected() { return this.tag === 'body' || !!this.parent?.isConnected; }
  replaceChildren(...c) { this.children = c; }
  setAttribute() {} addEventListener() {} removeAttribute() {} focus() {} pause() { this.paused = true; this.onpause?.(); } remove() {}
  async play() { this.paused = false; this.onplay?.(); }
  attachShadow() { this.shadow = new Element('shadow'); return this.shadow; }
  querySelectorAll(tag) { return this.children.flatMap(c => [...(c.tag === tag ? [c] : []), ...c.querySelectorAll(tag)]); }
  querySelector(tag) { return this.querySelectorAll(tag)[0]; }
  showModal() { this.open = true; } close() { this.open = false; }
  click() { return this.onclick?.(); }
}
async function run(mode) {
  const body = new Element('body'), requests = [], downloads = [], blobs = [];
  let nativeDone = false;
  class XHR {
    open(method, url) { this.method = method; this.url = url; this.headers = {}; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    send(body) {
      if (!this.onload) return; // Native platform capture in these fixtures has no response handler.
      if (this.method === 'POST' && !new URL(this.url, 'https://example.invalid').searchParams.has('session')) {
        Promise.resolve().then(() => { this.status = 200; this.responseText = JSON.stringify({ code: 0, data: { audios: [], pageSize: 1 } }); this.onload(); }); return;
      }
      fetch(new URL(this.url, 'https://example.invalid'), { method: this.method, headers: this.headers, body,
        credentials: this.withCredentials ? 'include' : 'same-origin' }).then(async r => {
        this.status = r.ok ? 200 : 503; this.responseText = JSON.stringify(await r.json()); nativeDone = true; this.onload();
      }).catch(e => { if (this.onerror) this.onerror(); else { console.error(e); process.exitCode = 1; } });
    }
    abort() { this.onabort?.(); }
  }
  let ready;
  const document = { body, createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'), getElementById: () => null,
    addEventListener(name, callback) { if (name === 'DOMContentLoaded') ready = callback; } };
  class TestURL extends URL { static createObjectURL(b) { blobs.push(b); return 'blob:synthetic'; } static revokeObjectURL() {} }
  const fetch = async (url, options) => {
    const u = new URL(url); requests.push(u);
    if (mode === 'audio-fail' && u.pathname.startsWith('/ptt/audio')) throw new TypeError('Synthetic network failure');
    if (mode === 'partial-audio-fail' && u.pathname.startsWith('/ptt/audio') && u.searchParams.get('page') === '1') throw new TypeError('Synthetic later-page failure');
    if (u.pathname.startsWith('/media/')) {
      assert.equal(options.credentials, u.origin === 'https://example.invalid' ? 'same-origin' : 'omit');
      if (mode === 'cors' || (mode === 'full-cors' && u.pathname === '/media/b.mp3')) throw new TypeError('Failed to fetch');
      const bytes = new Uint8Array([73, 68, 51, 1, 2]);
      return { ok: true, headers: new Headers({ 'content-type': 'audio/mpeg' }), body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) };
    }
    assert.equal(u.searchParams.get('session'), 'synthetic');
    if (options.signal) assert.equal(options.credentials, 'include');
    if (mode.includes('post')) {
      assert.equal(options.method, 'POST');
      assert.equal(new URLSearchParams(options.body).get('session'), 'synthetic');
      assert.equal(options.credentials, 'include');
    }
    const page = Number(u.searchParams.get('page'));
    let rows;
    if (u.pathname.startsWith('/ptt/group')) {
      throw new Error('Company-wide group lookup must never be requested');
      if (['auto-query', 'query-shortcut', 'partial-audio-fail'].includes(mode)) assert(nativeDone, 'Archive requests must wait for native Query response');
      assert.equal(u.searchParams.get('method'), 'get');
      if (mode === 'path-session') assert.equal(u.pathname, '/ptt/group;jsessionid=SYNTHETIC_ONLY');
      assert(!u.searchParams.get('group_id'));
      rows = page === 0 ? [{ group_id: 1, group_name: 'VOITURE 123' }, { group_id: 9, group_name: 'VOITURE 1234' }, { group_id: 2, group_name: 'INGENIEUR 123' }, ...(mode === 'group-other' ? [{ group_id: 3, group_name: 'Direction de course' }] : [])] : [];
    } else {
      if (mode === 'native-action') {
        assert.equal(u.searchParams.get('method'), 'getByUser');
        assert.equal(u.searchParams.get('start_time'), '2026-01-01 00:00:00');
        assert.equal(u.searchParams.get('end_time'), '2026-01-03 00:00:00');
        assert.equal(u.searchParams.get('order_type'), 'desc');
      }
      assert.notEqual(options.redirect, 'error');
      const group = u.searchParams.get('group_id'); assert((mode === 'group-other' ? ['3'] : ['1','2']).includes(group));
      if (mode === 'empty-result') rows = [];
      else if (mode === 'repeat') rows = [{ id: 1 }];
      else rows = page > 1 ? [] : page === 0 ? [
        { id: 'b', time: '2026-01-02 10:00:00', play_url: '/media/b.mp3', download_url: '/media/b-save.mp3', username: '<script>bad</script>' }
      ] : [{ id: 'a', time: '2026-01-01 10:00:00', play_url: '/media/a.mp3', download_url: '/media/a-save.mp3' }];
    }
    return { ok: true, json: async () => ({ code: 0, data: u.pathname.startsWith('/ptt/group') ? { groups: rows } : { audios: rows, pageSize: mode === 'empty-result' ? 1 : 2 } }) };
  };
  const context = { document, window: { fetch }, XMLHttpRequest: XHR, location: { origin: 'https://example.invalid', href: 'https://example.invalid/app' },
    performance: { getEntriesByType: () => mode.includes('post') || mode === 'no-session' || mode === 'auto-query' ? [] : [{ name: 'https://example.invalid/ptt/audio' + (mode === 'path-session' ? ';jsessionid=SYNTHETIC_ONLY' : '') + '?session=synthetic&group_id=9&limit=100' + (mode === 'native-action' ? '&method=getByUser&start_time=2026-01-01%2000:00:00&end_time=2026-01-03%2000:00:00&order_type=desc' : '') }] },
    URL: TestURL, URLSearchParams, Headers, Request, Uint32Array, Uint8Array, DataView, TextEncoder, Blob, fetch, AbortController, DOMException, setTimeout() {}, clearTimeout() {} };
  const observers = [];
  if (['auth-lifecycle', 'login-initial', 'login-form'].includes(mode)) {
    context.window.history = {
      pushState(state, title, url) { context.location.href = new URL(url, context.location.href).href; return 'history-result'; },
      replaceState(state, title, url) { context.location.href = new URL(url, context.location.href).href; return 'history-result'; }
    };
    context.performance.now = () => 1000;
    if (mode === 'login-initial') context.location.href = 'https://example.invalid/login';
    if (mode === 'login-form') document.querySelectorAll = selector => selector.startsWith('.site-page--login') ? [{ getClientRects: () => [1] }] : [];
  }
  const savedPreferences = new Map();
  context.window.localStorage = { getItem: key => savedPreferences.get(key) || null, setItem: (key, value) => savedPreferences.set(key, value) };
  let navigations = 0, tabClicks = 0;
  if (mode === 'navigate') {
    let arrived = false;
    const router = { async push(path) { assert.equal(path, '/data-center/recorder'); arrived = true; navigations++; } };
    document.querySelectorAll = selector => {
      if (selector === '#app, .site-wrapper') return [{ __vue__: { $router: router } }];
      if (selector === '.data-center-tabs a, .data-center-tabs button' && arrived)
        return [{ textContent: 'Audio Records', click() { tabClicks++; } }];
      return [];
    };
  }
  if (['merge','full-playback','full-cors','auth-lifecycle'].includes(mode)) context.window.AudioContext = class {
    constructor() { this.sampleRate = 24000; }
    async resume() {} async close() {}
    async decodeAudioData() { return { length: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array(48000) }; }
  };
  if (mode === 'restore-host') context.MutationObserver = class { constructor(callback) { observers.push(callback); } observe() {} };
  if (mode === 'blocked-hook') Object.freeze(XHR.prototype);
  if (mode === 'browser-module') context.module = { exports: {} };
  if (mode === 'deferred-body') document.body = null;
  if (mode === 'generic-discovery') document.querySelectorAll = selector => selector.includes('.audio-records .el-select input') ? [{value:'RACE CONTROL FUNCUP (106594)'}] : selector === '.audio-records .filter-box .el-select' ? [{__vue__:{options:[{value:121665,label:'RACE CONTROL LIGIER'}],cachedOptions:[{value:121665,label:'RACE CONTROL LIGIER'}]}}] : [];
  let nativeClicks = 0;
  if (['auto-query', 'query-shortcut', 'calendar-reject', 'partial-audio-fail', 'group-exact'].includes(mode)) {
    class NativeDate { set value(v) { this.stored = v; } get value() { return this.stored; } dispatchEvent() {} }
    const pageDate = new NativeDate();
    pageDate.ownerDocument = { defaultView: { HTMLInputElement: NativeDate, Event: class {}, KeyboardEvent: class {} } };
    const calendar = {
      type: 'datetime', value: '2026-10-23 00:00:00', parsedValue: new Date(2026, 9, 23),
      parseString: text => new Date(text.replace(' ', 'T')), emitInput() {},
      isValidValue: () => mode !== 'calendar-reject', async $nextTick() {}, emitChange() {},
      picker: { value: new Date(2026, 9, 23), $emit(event, date) {
        assert.equal(event, 'pick'); this.value = date; calendar.parsedValue = date;
        calendar.value = '2026-01-01 00:00:00'; pageDate.value = calendar.value;
      } }
    };
    pageDate.__vue__ = { $parent: calendar };
    const selectedGroup = { value: 'Mecano 340 (999)' };
    const nativeSelect = { click() {}, querySelector: () => selectedGroup };
    const groupOptions = [
      { textContent: 'Mecano 340 (999)', click() { throw new Error('Wrong licence selected'); } },
      { textContent: 'INGENIEUR 123 (2)', click() { selectedGroup.value = this.textContent; } },
      { textContent: 'VOITURE 123 (1)', click() { selectedGroup.value = this.textContent; } }
    ];
    document.querySelectorAll = selector => selector === '.audio-records .filter-box .filter-item > button.el-button--primary' ? [{ textContent: 'Query', click() {
      nativeClicks++;
      assert(!body.children[0].shadow.querySelector('dialog').open);
      assert.equal(pageDate.value, '2026-01-01 00:00:00');
      assert.equal(calendar.parsedValue.getTime(), new Date(2026, 0, 1).getTime());
      assert.equal(calendar.picker.value.getTime(), calendar.parsedValue.getTime());
      assert.equal(selectedGroup.value, mode === 'group-exact' ? 'INGENIEUR 123 (2)' : 'VOITURE 123 (1)');
      const xhr = new XHR(); xhr.open('GET', '/ptt/audio?session=synthetic&method=getByUser&group_id=' + (mode === 'group-exact' ? '2' : '1') + '&start_time=2026-01-01+00%3A00%3A00&limit=100&page=0&order_type=desc'); xhr.send();
    } }] : selector === '.audio-records .filter-box .el-select' ? [nativeSelect] : selector === '.el-select-dropdown__item' ? groupOptions : selector.includes('.audio-records .el-date-editor input') ? [pageDate] : selector.includes('.audio-records .el-select input') ? [{ value: 'VOITURE 123 (1)' }] : [];
  }
  let child;
  if (mode === 'iframe-post') {
    class FrameXHR extends XHR {}
    child = { document: { querySelectorAll: () => [] }, XMLHttpRequest: FrameXHR, location: { href: 'https://example.invalid/records' } };
    const frame = { contentWindow: child, addEventListener() {} };
    document.querySelectorAll = selector => selector === 'iframe,frame' ? [frame] : []; context.window.document = document;
  }
  if (mode !== 'generic-discovery') {
    const originalQuery = document.querySelectorAll?.bind(document);
    document.querySelectorAll = selector => {
      if (selector.includes('.audio-records .el-select input')) return [
        {value:'VOITURE 123 (1)'}, {textContent:'INGENIEUR 123 (2)'}, {textContent:'VOITURE 1234 (9)'},
        ...(mode === 'group-other' ? [{textContent:'Direction de course (3)'}] : [])
      ];
      return originalQuery?.(selector) || [];
    };
  }
  vm.runInNewContext(fs.readFileSync('archives.js', 'utf8'), context);
  if (mode === 'deferred-body') { assert.equal(body.children.length, 0); document.body = body; ready(); }
  if (mode === 'restore-host') {
    const originalHost = body.children[0]; body.children = []; originalHost.parent = null;
    assert(observers.length); observers[0](); assert.equal(body.children[0], originalHost);
    vm.runInNewContext(fs.readFileSync('archives.js', 'utf8'), context);
    assert.equal(body.children.length, 1);
  }
  assert(body.children[0].shadow.querySelectorAll('button').some(b => b.textContent === 'Historique Audio'));
  if (mode === 'iframe-post') {
    const xhr = new child.XMLHttpRequest(); xhr.open('POST', 'https://api.example.invalid/ptt/audio'); xhr.withCredentials = true;
    xhr.send('session=synthetic&group_id=9&limit=100');
  }
  if (mode === 'xhr-post') {
    const xhr = new XHR(); xhr.open('POST', 'https://api.example.invalid/ptt/audio'); xhr.withCredentials = true;
    xhr.send('session=synthetic&group_id=9&limit=100');
  }
  if (mode === 'fetch-post') {
    // Observe a native cross-origin POST without sending a real network request.
    await context.window.fetch('https://api.example.invalid/ptt/audio?session=synthetic&page=3&group_id=1', {
      method: 'POST', credentials: 'include', body: 'session=synthetic&group_id=1&limit=100'
    });
    requests.length = 0;
  }
  if (mode === 'xhr-post' || mode === 'iframe-post') await new Promise(setImmediate);
  const host = body.children[0], root = host.shadow;
  if (mode === 'login-initial' || mode === 'login-form') {
    assert(host.style.cssText.includes('display:none!important'));
    root.querySelectorAll('button').find(b => b.textContent === 'Historique Audio').click();
    assert.equal(requests.length, 0);
    if (mode === 'login-initial') {
      context.window.history.pushState({}, '', '/app');
      assert(host.style.cssText.includes('display:block!important'));
    }
    return;
  }
  if (mode === 'generic-discovery') {
    root.querySelectorAll('button').find(b=>b.textContent==='Historique Audio').click();
    for(let i=0;i<30;i++) await new Promise(setImmediate);
    const options=root.querySelectorAll('select')[1].children;
    assert(options.some(o=>o.value==='106594' && o.textContent==='RACE CONTROL FUNCUP'));
    assert(options.some(o=>o.value==='121665' && o.textContent==='RACE CONTROL LIGIER'));
    assert(!root.querySelector('ul').textContent.includes('RACE CONTROL'));
    assert.deepEqual(root.querySelectorAll('select')[0].children.map(o=>o.value),['group']);
    assert.equal(root.querySelectorAll('input')[0].parent.parent.hidden,true);
    return;
  }
  const buttons = root.querySelectorAll('button'); const input = root.querySelectorAll('input')[0];
  root.querySelectorAll('input').find(i => i.type === 'datetime-local').value = '2026-01-01T00:00:00';
  if (mode === 'invalid-date') root.querySelectorAll('input').find(i => i.type === 'datetime-local').value = '';
  if (mode === 'auto-query') root.querySelector('dialog').showModal();
  if (mode === 'licence-list' || mode === 'navigate') {
    buttons.find(b => b.textContent === 'Historique Audio').click();
    for (let i = 0; i < 30 && buttons.find(b => b.textContent === 'Charger les archives').disabled; i++) await new Promise(setImmediate);
    const menu = root.querySelector('ul');
    assert.deepEqual(menu.querySelectorAll('button').map(o => o.value), ['123', '1234']);
    root.querySelectorAll('button').find(b => b.textContent === '⌄').click(); assert.equal(menu.hidden, false);
    assert.deepEqual(menu.querySelectorAll('button').map(o => o.textContent), ['123', '1234']);
    menu.querySelectorAll('button')[1].click(); assert.equal(input.value, '1234'); assert.equal(menu.hidden, true);
    input.value = '1234'; input.oninput(); assert.equal(menu.querySelectorAll('button').length, 1);
    input.value = '123';
    if (mode === 'navigate') { assert.equal(navigations, 1); assert.equal(tabClicks, 1); }
  }
  if (mode.startsWith('group-')) {
    buttons.find(b => b.textContent === 'Historique Audio').click();
    for (let i=0; i<30 && buttons.find(b => b.textContent === 'Charger les archives').disabled; i++) await new Promise(setImmediate);
    const selects=root.querySelectorAll('select'); selects[0].value='group'; selects[0].onchange();
    selects[1].value=mode === 'group-other' ? '3' : '2'; selects[1].onchange();
    assert.equal(input.parent.parent.hidden,true); assert.equal(selects[1].parent.hidden,false);
  }
  input.value = mode === 'unauthorized-licence' ? '999' : mode.startsWith('group-') ? '' : '123'; await buttons.find(x => x.textContent === 'Charger les archives').click();
  if (mode === 'unauthorized-licence') { assert.equal(requests.length,0); assert(root.textContent.includes('Aucun groupe correspondant')); return; }
  if (mode === 'calendar-reject') { assert.equal(nativeClicks, 0); assert.equal(requests.length, 0); assert(root.textContent.includes('Date refusée par le calendrier')); return; }
  if (mode === 'invalid-date') { assert.equal(requests.length, 0); assert(root.textContent.includes('date et une heure valides')); return; }
  if (mode === 'auto-query') assert.equal(nativeClicks, 1);
  if (mode === 'no-session') {
    assert(root.textContent.includes('Session non détectée : fermez cette fenêtre'));
    assert.equal(root.querySelectorAll('details').find(d => d.textContent.includes('Query de session')).hidden, false);
    assert.equal(requests.length, 0); return;
  }
  const zipButton = buttons.find(x => x.textContent === 'Exporter tous les audios en ZIP');
  if (mode === 'partial-audio-fail') {
    assert(zipButton.disabled); assert(root.textContent.includes('Résultats incomplets : 1 audios affichés'));
    assert.equal(root.querySelector('tbody').querySelectorAll('tr').length, 1); return;
  }
  if (mode === 'empty-result') { assert(zipButton.disabled); assert(root.textContent.includes('0 audios à partir du 2026-01-01 00:00:00')); return; }
  if (mode === 'audio-fail') {
    assert(zipButton.disabled);
    assert(root.textContent.includes('Chargement des audios de VOITURE 123 : Connexion au serveur'));
    return;
  }
  if (mode === 'repeat') { assert(zipButton.disabled); return; }
  const trs = root.querySelector('tbody').querySelectorAll('tr'); assert.equal(trs.length, 2, mode + ': ' + root.textContent);
  assert(trs[0].children[0].textContent.includes('01/01/2026')); assert.equal(trs[0].children[1].textContent, mode === 'group-other' ? 'Direction de course' : mode.startsWith('group-') ? 'INGENIEUR 123' : 'VOITURE 123');
  if (mode.startsWith('group-')) {
    const audioRequests=requests.filter(u=>u.pathname.startsWith('/ptt/audio'));
    assert(audioRequests.length);
    assert(audioRequests.every(u=>u.searchParams.get('group_id') === (mode === 'group-other' ? '3' : '2')));
  }
  if (mode === 'labels') {
    const editor = root.querySelectorAll('details').find(d => d.textContent.includes('Modifier les libellés des groupes'));
    editor.querySelectorAll('input')[0].value = 'Voiture n°23';
    await editor.querySelectorAll('button').find(b => b.textContent === 'Enregistrer les libellés').click();
    assert.equal(root.querySelector('tbody').querySelectorAll('tr')[0].children[1].textContent, 'Voiture n°23');
    assert.equal(JSON.parse(savedPreferences.get('shop-racing-archive-labels'))['123'].VOITURE, 'Voiture n°23');
  }
  if (mode === 'full-cors') {
    await root.querySelectorAll('button').find(b=>b.textContent==='Tout écouter').click();
    const range=root.querySelectorAll('input').find(i=>i.type==='range');
    assert.equal(range.max,'2'); assert(root.textContent.includes('Lecture partielle : 1 indisponibles'));
    assert(root.textContent.includes('1 échecs : fichier partiel.'));
    return;
  }
  if (mode === 'full-playback') {
    const listen=root.querySelectorAll('button').find(b=>b.textContent==='Tout écouter');
    const player=root.querySelectorAll('audio').find(a=>a.parent?.className==='tools');
    await listen.click(); assert.equal(player.src,'blob:synthetic'); assert.equal(listen.textContent,'Pause');
    const range=root.querySelectorAll('input').find(i=>i.type==='range');
    assert.equal(player.parent.hidden,true,'Old controls must hide when the timeline appears');
    const timelineButton=range.parent.children.find(n=>n.tag==='button');
    assert.equal(timelineButton.textContent,'Ⅱ Pause');
    await timelineButton.click(); assert(player.paused); assert.equal(timelineButton.textContent,'▶ Lecture');
    await timelineButton.click(); assert(!player.paused); assert.equal(timelineButton.textContent,'Ⅱ Pause');
    assert(!root.textContent.includes('Échanges à la suite, sans les silences'));
    assert.equal(range.max,'4'); range.value='2.5'; range.oninput(); assert.equal(player.currentTime,2.5);
    assert(root.querySelector('output').textContent.includes('02/01/2026'));
    await listen.click(); assert(player.paused); await listen.click(); assert(!player.paused);
    return;
  }
  if (mode === 'queue') {
    const listen = root.querySelectorAll('button').find(b => b.textContent === 'Tout écouter');
    const player = root.querySelectorAll('audio').find(a => a.parent?.className === 'tools');
    await listen.click(); assert.equal(player.src, 'https://example.invalid/media/a.mp3'); assert.equal(listen.textContent, 'Pause');
    await listen.click(); assert(player.paused); assert.equal(listen.textContent, 'Reprendre');
    await listen.click(); assert.equal(player.paused, false);
    player.onended(); await Promise.resolve(); assert.equal(player.src, 'https://example.invalid/media/b.mp3');
    player.onended(); await Promise.resolve(); assert.equal(listen.textContent, 'Tout écouter'); assert(root.textContent.includes('Lecture terminée.'));
  }
  await zipButton.click();
  if (mode === 'labels') assert(new TextDecoder().decode(await blobs[0].arrayBuffer()).includes('Voiture_n_23'));
  if (mode === 'cors') { assert.equal(blobs.length, 0); assert(root.textContent.includes('aucun ZIP créé')); }
  else {
    assert.equal(blobs.length, 1); assert.equal(blobs[0].type, 'application/zip');
    assert(requests.some(u => u.pathname === '/media/a-save.mp3'));
    assert(requests.some(u => u.pathname === '/media/b-save.mp3'));
    assert(root.textContent.includes('ZIP prêt : 2/2'));
    assert(root.querySelectorAll('button').some(x => x.textContent.includes('Télécharger le ZIP')));
  }
  assert(!requests.some(u => !['https://example.invalid', 'https://api.example.invalid'].includes(u.origin)));
  if (mode === 'auth-lifecycle') {
    root.querySelector('dialog').showModal();
    const listen = root.querySelectorAll('button').find(b => b.textContent === 'Tout écouter');
    await listen.click();
    assert.equal(listen.textContent, 'Pause');
    const previousRequests = requests.length;
    const queryInput = root.querySelectorAll('input').find(i => i.type === 'password');
    queryInput.value = 'synthetic-private-query';
    assert.equal(context.window.history.pushState({}, '', '/login'), 'history-result');
    assert(host.style.cssText.includes('display:none!important'));
    assert.equal(root.querySelector('dialog').open, false);
    assert.equal(root.querySelector('tbody').querySelectorAll('tr').length, 0);
    assert.equal(queryInput.value, ''); assert.equal(input.value, '');
    assert.equal(listen.textContent, 'Tout écouter');
    context.window.history.replaceState({}, '', '/app');
    assert(host.style.cssText.includes('display:block!important'));
    input.value = '123'; root.querySelectorAll('input').find(i => i.type === 'datetime-local').value = '2026-01-01T00:00:00';
    await root.querySelectorAll('button').find(b => b.textContent === 'Charger les archives').click();
    assert.equal(requests.length, previousRequests, 'Old request URL must not be reused after logout');
    assert(root.textContent.includes('Session non détectée'));
  }
  if (mode === 'merge') {
    await root.querySelectorAll('button').find(b => b.textContent === 'Créer un audio unique (WAV)').click();
    assert.equal(blobs.length, 3); assert.equal(blobs[1].type, 'audio/wav');
    assert.equal(blobs[1].size, 192044);
    const range=root.querySelectorAll('input').find(i=>i.type==='range');
    const player=root.querySelectorAll('audio').find(a=>a.parent?.className==='tools');
    assert.equal(range.max,'4'); assert.equal(range.parent.hidden,false);
    range.value='1'; range.oninput(); assert.equal(player.currentTime,1);
    assert(root.querySelector('output').textContent.includes('01/01/2026'));
    range.value='2'; range.oninput(); assert.equal(player.currentTime,2);
    assert(root.querySelector('output').textContent.includes('02/01/2026'));
    const jump=root.querySelectorAll('input').filter(i=>i.type==='datetime-local')[1];
    jump.value='2026-01-01T15:00:00'; root.querySelectorAll('button').find(b=>b.textContent==='Aller').click();
    assert.equal(player.currentTime,2,'A time inside a silence must seek to the following recording');
    jump.value='2026-01-02T10:00:01'; root.querySelectorAll('button').find(b=>b.textContent==='Aller').click(); assert.equal(player.currentTime,3);
    assert(root.textContent.includes('Audio unique prêt : 2/2'));
    assert.deepEqual(requests.filter(u => /^\/media\/[ab]\.mp3$/.test(u.pathname)).map(u => u.pathname), ['/media/a.mp3', '/media/b.mp3']);
    root.querySelectorAll('button').find(b => b.textContent === 'Télécharger l’audio unique').click();
    assert(body.children.some(n => n.download?.includes('2026-01-01_au_2026-01-02_Licence-123')));
  }
  if (mode === 'query-shortcut') {
    assert.equal(nativeClicks, 1);
    assert.equal(requests.filter(u => u.pathname === '/ptt/audio' && u.searchParams.get('group_id') === '1' && u.searchParams.get('page') === '0').length, 1, 'Successful native page must be reused without duplicate fetch');
    assert(!root.querySelectorAll('button').some(b => b.textContent === 'Lancer Query de la page'));
    assert.equal(root.querySelector('tbody').querySelectorAll('tr').length, 2);
  }
}
(async () => { for (const m of ['success', 'full-cors', 'full-playback', 'unauthorized-licence', 'generic-discovery', 'group-only', 'group-other', 'group-exact', 'login-initial', 'login-form', 'auth-lifecycle', 'labels', 'queue', 'navigate', 'partial-audio-fail', 'calendar-reject', 'invalid-date', 'empty-result', 'merge', 'query-shortcut', 'audio-fail', 'licence-list', 'auto-query', 'native-action', 'path-session', 'cors', 'repeat', 'xhr-post', 'fetch-post', 'iframe-post', 'no-session', 'restore-host', 'blocked-hook', 'browser-module', 'deferred-body']) await run(m); console.log('PASS: group-only selection without licence, arbitrary groups, exact native group sync and scoped audio requests; licence mode, login, labels, queue and exports.'); })().catch(e => { console.error(e); process.exitCode = 1; });
