// Lecture des groupes utilisateur et synchronisation des contrôles natifs.
// Assemblé dans la même fermeture privée : voir README.md.
function el(tag, text, parent) {
  const node = document.createElement(tag); if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node); return node;
}
function portalRoots() {
  scanFrames(window);
  const roots = [], seen = new Set();
  function visit(root) {
    if (!root || seen.has(root) || !root.querySelectorAll) return;
    seen.add(root); roots.push(root);
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot) visit(node.shadowRoot);
  }
  visit(document);
  for (const scope of accessibleWindows) { try { visit(scope.document); } catch (_) {} }
  return roots;
}
function dropdownGroups() {
  const found = new Map();
  for (const root of portalRoots()) {
    for (const node of root.querySelectorAll('.audio-records .el-select input, .audio-records select option, .audio-records .el-select-dropdown__item')) {
      const group = dropdownGroup(node.value || node.textContent);
      if (group) found.set(group.id, group);
    }
  }
  // Read options owned by the audio selector, including its detached menu.
  // Never use the company-wide group endpoint as evidence of user membership.
  for (const root of portalRoots()) for (const select of root.querySelectorAll('.audio-records .filter-box .el-select')) {
    const component = select.__vue__;
    for (const option of [...(component?.options || []), ...(component?.cachedOptions || [])]) {
      const group = dropdownGroup(option.currentLabel || option.label);
      const id = option.value;
      if (group) found.set(group.id, group);
      else if (id != null && /^\d+$/.test(String(id))) {
        const label = String(option.currentLabel || option.label || '').trim();
        if (label) found.set(String(id), {id:String(id),label,...(roleLicense(label) || {})});
      }
    }
  }
  return found;
}
function pageDateInput() {
  for (const root of portalRoots()) {
    const input = root.querySelectorAll('.audio-records .el-date-editor input, .audio-records input[placeholder="Select Time"]')[0];
    if (input) return input;
  }
  return null;
}
async function syncPageDate(value) {
  const input = pageDateInput(); if (!input || !value) return;
  // Element UI keeps a separate calendar model. Commit through its own pick handler.
  let component;
  for (let node = input, depth = 0; node && depth < 5 && !component; node = node.parentElement, depth++) {
    let vm = node.__vue__;
    for (let i = 0; vm && i < 5; vm = vm.$parent, i++) {
      if (vm.type === 'datetime' && typeof vm.parseString === 'function' && typeof vm.emitInput === 'function') { component = vm; break; }
    }
  }
  if (component) {
    if (!component.picker && component.mountPicker) component.mountPicker();
    const date = component.parseString(value);
    if (!date || (component.isValidValue && !component.isValidValue(date)) || !component.picker?.$emit)
      throw new Error('Date refusée par le calendrier de la page. Choisissez une autre date.');
    component.picker.$emit('pick', date, false);
    if (component.$nextTick) await component.$nextTick();
    component.emitChange?.(component.value);
    if (component.$nextTick) await component.$nextTick();
    const confirmed = component.parsedValue;
    if (!confirmed || typeof confirmed.getTime !== 'function' || confirmed.getTime() !== date.getTime())
      throw new Error('La date n’a pas été confirmée par le calendrier. Query n’a pas été lancé.');
    return;
  }
  const scope = input.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(scope.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  for (const event of ['input', 'change']) input.dispatchEvent(new scope.Event(event, { bubbles: true }));
  await Promise.resolve();
  input.dispatchEvent(new scope.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  input.dispatchEvent(new scope.Event('blur', { bubbles: true }));
}
async function syncPageGroup(number, groupId) {
  if (!number && !groupId) return true;
  const wanted = groupId && availableGroups.get(groupId);
  const matchesGroup = text => {
    const match = /^(.*?)\s*\((\d+)\)\s*$/.exec(String(text || '').trim());
    return match ? match[2] === groupId : !!wanted && String(text || '').trim() === wanted.label;
  };
  const roots = portalRoots();
  let select;
  for (const root of roots) {
    select = root.querySelectorAll('.audio-records .filter-box .el-select')[0];
    if (select) break;
  }
  if (!select) return false;
  const current = select.querySelector('input');
  const parsed = dropdownGroup(current?.value);
  if (groupId ? matchesGroup(current?.value) : parsed?.license === number) return true;
  const choose = () => {
    const options = [];
    // Element UI may place the menu inside the select or append it to the document.
    for (const root of roots) for (const node of root.querySelectorAll('.el-select-dropdown__item')) {
      const group = dropdownGroup(node.textContent) || roleLicense(node.textContent);
      const matches = groupId ? (matchesGroup(node.textContent) || String(node.__vue__?.value ?? '') === groupId) : group?.license === number;
      if (matches && !node.classList?.contains('is-disabled')) options.push({ node, group: group || {role:''} });
    }
    const rank = role => ['VOITURE', 'INGENIEUR', 'MECANO', 'MECANICIEN'].indexOf(role);
    options.sort((a, b) => rank(a.group.role) - rank(b.group.role));
    if (!options.length) return false;
    options[0].node.click(); return true;
  };
  select.click();
  // Let the portal render its menu and apply the real option's own selection handler.
  await Promise.resolve();
  if (!choose()) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (!choose()) { select.click(); throw new Error(groupId ? 'Le groupe choisi est introuvable dans Select Group.' : 'Aucun groupe de la licence ' + number + ' dans Select Group. Ouvrez cette liste dans la page et vérifiez la licence.'); }
  }
  await Promise.resolve();
  const selected = dropdownGroup(current?.value);
  if (groupId ? !matchesGroup(current?.value) : selected?.license !== number) throw new Error('La sélection du groupe n’a pas été confirmée dans Select Group.');
  return true;
}
async function detectWithNativeQuery(force, date, number, groupId) {
  nativeQueryIssue = '';
  if (!force && discover()) return true;
  let button;
  for (const root of portalRoots()) {
    button = Array.from(root.querySelectorAll('.audio-records .filter-box .filter-item > button.el-button--primary')).find(b => !b.disabled);
    if (!button) button = Array.from(root.querySelectorAll('.audio-records button')).find(b => !b.disabled && /^query$/i.test(String(b.textContent || '').trim()));
    if (!button) button = Array.from(root.querySelectorAll('button, [role="button"]')).find(b =>
      !b.disabled && /^query$/i.test(String(b.textContent || '').trim()) && (!b.getClientRects || b.getClientRects().length));
    if (button) break;
  }
  if (!button) return false;
  message('Détection de la session : recherche audio automatique…');
  return new Promise(resolve => {
    let timer;
    const wasOpen = panel && panel.open;
    const done = success => {
      clearTimeout(timer); sessionWaiters.delete(done);
      if (wasOpen && !panel.open && !isLoginPage()) panel.showModal();
      resolve(success);
    };
    sessionWaiters.add(done);
    timer = setTimeout(() => done(false), 10000);
    Promise.resolve().then(async () => {
      if (wasOpen) panel.close();
      await syncPageGroup(number, groupId);
      await syncPageDate(date); button.click();
    }).catch(e => { nativeQueryIssue = e.message || 'Sélection du groupe impossible.'; done(false); });
  });
}
