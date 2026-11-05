// Capture dans les cadres accessibles et découverte de session.
// Assemblé dans la même fermeture privée : voir README.md.
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
          if (item && item.url) { item.body = arguments[0]; observeAudioCompletion(this, item); }
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
  if (isLoginPage()) return false;
  scanFrames(window);
  if (sessionURL) return true;
  // Resource timing only, including accessible portal frames; no storage or cookies are scanned.
  for (const scope of accessibleWindows) {
  let entries;
  try { const p = scope.performance || (scope === window ? performance : null); entries = p && p.getEntriesByType ? p.getEntriesByType('resource') : []; }
  catch (_) { continue; }
  for (let i = entries.length - 1; i >= 0; i--) {
    if (sessionTimingFloor && (!Number.isFinite(entries[i].startTime) || entries[i].startTime < sessionTimingFloor)) continue;
    const observed = ['xmlhttprequest', 'fetch'].includes(entries[i].initiatorType);
    const u = audioRequest(entries[i].name, observed); if (u) { capture(u, {}, 'GET', null, 'same-origin', observed); return true; }
  }
  }
  return false;
}
