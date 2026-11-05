// Capture des requêtes natives XHR et fetch.
// Assemblé dans la même fermeture privée : voir README.md.
function audioRequest(value, observed) {
  try {
    const u = new URL(String(value), location.href);
    return (observed || u.origin === location.origin) && /^https?:$/.test(u.protocol) &&
      !u.username && !u.password && AUDIO_PATH.test(u.pathname) ? u : null;
  } catch (_) { return null; }
}
function capture(value, headers, method, body, credentials, observed) {
  if (isLoginPage()) return;
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
  for (const ready of sessionWaiters) ready(true);
  sessionWaiters.clear();
  if (queryBox) { queryBox.hidden = true; queryBox.querySelector('input').value = ''; }
  if (status && !busy) status.textContent = 'Session détectée. Saisissez la licence puis chargez les archives.';
}
const nativeFetch = window.fetch ? window.fetch.bind(window) : fetch;
function observeAudioCompletion(xhr, info) {
  const generation = authGeneration;
  const finished = () => {
    try {
      if (generation !== authGeneration || isLoginPage()) return;
      if (xhr.status < 200 || xhr.status >= 300) return;
      const payload = xhr.responseType === 'json' ? xhr.response : JSON.parse(xhr.responseText);
      listEnvelope(payload, 'audio');
      nativeAudioResult = { url: new URL(info.url), payload };
      capture(info.url, info.headers, info.method, info.body, xhr.withCredentials ? 'include' : 'same-origin', true);
    } catch (_) { /* A failed or unrelated response cannot replace a working session. */ }
  };
  if (xhr.addEventListener) xhr.addEventListener('loadend', finished, { once: true });
  else {
    const previous = xhr.onload;
    xhr.onload = function () { if (previous) previous.apply(this, arguments); finished(); };
  }
}
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
  if (info && /^(accept|content-type|authorization|x-[\w-]+|token|sessionid)$/i.test(name)) info.headers[name] = String(value);
  return result;
};
XMLHttpRequest.prototype.send = function () {
  const info = xhrInfo.get(this);
  try {
    if (info && info.url) { info.body = arguments[0]; observeAudioCompletion(this, info); }
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
