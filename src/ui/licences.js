// Menu des licences et navigation vers les archives natives.
// Assemblé dans la même fermeture privée : voir README.md.
function offerLicences(groups) {
  offerGroups(groups, true);
  const numbers = new Set();
  for (const group of groups) {
    const parsed = group.license ? group : roleLicense(group.name ?? group.group_name ?? group.groupName);
    if (parsed) numbers.add(parsed.license);
  }
  licenceNumbers = Array.from(numbers).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const previousScope = scopeSelect.value;
  scopeSelect.replaceChildren();
  if (licenceNumbers.length) el('option', 'Toute une licence', scopeSelect).value = 'licence';
  el('option', 'Un groupe seul', scopeSelect).value = 'group';
  scopeSelect.value = licenceNumbers.length && previousScope !== 'group' ? 'licence' : 'group';
  syncScopeControls();
  renderLicenceMenu(false);
}
function renderLicenceMenu(filter) {
  licenceList.replaceChildren();
  const matches = licenceNumbers.filter(n => !filter || n.includes(licence.value.trim()));
  for (const number of matches) {
    const item = el('li', null, licenceList), option = el('button', number, item);
    option.type = 'button'; option.value = number; option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(licence.value === number));
    if (licence.value === number) option.className = 'selected';
    option.onmousedown = event => event.preventDefault();
    option.onclick = () => { licence.value = number; refreshLabelFields(); showLicenceMenu(false); licence.focus(); };
  }
  if (!matches.length) el('li', licenceNumbers.length ? 'Aucune licence correspondante' : 'Chargement des licences…', licenceList).className = 'licence-empty';
}
function showLicenceMenu(open, filter) {
  if (open) renderLicenceMenu(!!filter);
  licenceList.hidden = !open; licence.setAttribute('aria-expanded', String(open));
  licenceToggle.setAttribute('aria-expanded', String(open));
}
async function ensureAudioPage() {
  const findTab = () => {
    for (const root of portalRoots()) {
      const tab = Array.from(root.querySelectorAll('.data-center-tabs a, .data-center-tabs button')).find(n => /^audio\s*records$/i.test(String(n.textContent || '').trim()));
      if (tab) return tab;
    }
    return null;
  };
  const existing = findTab();
  if (existing) {
    const reopen = panel?.open; if (reopen) panel.close();
    try { if (!existing.classList?.contains('is-active')) existing.click(); await Promise.resolve(); }
    finally { if (reopen && !panel.open && !isLoginPage()) panel.showModal(); }
    return;
  }
  if (pageDateInput()) return;
  const wasOpen = panel?.open; if (wasOpen) panel.close();
  try {
    let navigated = false;
    for (const root of portalRoots()) {
      for (const node of root.querySelectorAll('#app, .site-wrapper')) {
        let vm = node.__vue__;
        for (let i = 0; vm && i < 5; vm = vm.$parent, i++) {
          if (vm.$router?.push) {
            await Promise.resolve(vm.$router.push('/data-center/recorder')).catch(() => {});
            navigated = true; break;
          }
        }
        if (navigated) break;
      }
      if (navigated) break;
      const link = Array.from(root.querySelectorAll('a, button')).find(n => /^data\s*center$/i.test(String(n.textContent || '').trim()));
      if (link) { link.click(); navigated = true; break; }
    }
    if (!navigated) return;
    message('Ouverture des enregistrements audio…');
    for (let i = 0; i < 60; i++) {
      const tab = findTab();
      if (tab) { if (!tab.classList?.contains('is-active')) tab.click(); await Promise.resolve(); return; }
      if (pageDateInput()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('La page Audio Records ne s’est pas ouverte. Réessayez après la connexion.');
  } finally { if (wasOpen && !panel.open && !isLoginPage()) panel.showModal(); }
}
function suggestLicences() {
  if (suggestionsTask || busy) return;
  let hints = Array.from(dropdownGroups().values()); offerLicences(hints);
  loadButton.disabled = true;
  suggestionsTask = (async () => {
    try {
      await ensureAudioPage();
      hints = Array.from(dropdownGroups().values()); offerLicences(hints);
      if (!dateInput.value) {
        const initial = searchDate(pageDateInput()?.value) || searchDate(sessionURL?.searchParams.get('start_time'));
        if (initial) dateInput.value = initial.replace(' ', 'T');
      }
      offerLicences(Array.from(dropdownGroups().values()));
      message(scopeSelect.value === 'group' ? 'Choisissez un groupe accessible à votre compte.' : 'Choisissez une licence accessible à votre compte.');
    } catch (_) {
      message(scopeSelect.value === 'group' ? (availableGroups.size ? 'Choisissez un groupe disponible dans la liste du portail.' : 'Aucun groupe détecté. Vérifiez la liste Select Group du portail pour ce compte.') : 'Liste de licences partielle ou indisponible. Vous pouvez saisir le numéro au clavier.');
    } finally { suggestionsTask = null; loadButton.disabled = busy; }
  })();
}
