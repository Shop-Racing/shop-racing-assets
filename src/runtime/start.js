// Démarrage synchrone et installation des interceptions.
// Assemblé dans la même fermeture privée : voir README.md.
window.__shopRacingArchives.restore = mount;
// Display first: a blocked network hook must never prevent access to the portal.
mount();
let hookFailed = false;
try { installXHRHook(); } catch (_) { hookFailed = true; }
try { installFetchHook(); } catch (_) { hookFailed = true; }
try { discover(); } catch (_) { hookFailed = true; }
if (hookFailed && status) message('La détection automatique est limitée dans ce navigateur. Lancez une recherche audio habituelle, puis chargez les archives.');
