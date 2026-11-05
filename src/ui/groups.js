// Libellés et choix du périmètre.
// Assemblé dans la même fermeture privée : voir README.md.
function groupLabel(record) {
  const group = roleLicense(record.group);
  const label = group && displayNames[group.license]?.[group.role];
  return typeof label === 'string' && label.trim() ? label.slice(0, 80) : record.group;
}
function refreshLabelFields() {
  for (const [role, input] of aliasFields) input.value = displayNames[licence.value.trim()]?.[role] || '';
}
const candidates = new Map(), availableGroups = new Map();
let scopeSelect, groupSelect, licenceControl, groupControl, loadedScope = null;
function scopeTitle() {
  return loadedScope?.kind === 'group' ? 'Groupe-' + groupLabel({ group: loadedScope.group }) : 'Licence-' + (loadedScope?.number || licence.value);
}
function offerGroups(groups, replace = false) {
  if (replace) availableGroups.clear();
  for (const g of groups) {
    const id = g.id ?? g.group_id ?? g.groupId;
    const name = g.group_name ?? g.name ?? g.groupName ?? g.label;
    if (id != null && typeof name === 'string' && name.trim()) availableGroups.set(String(id), { id: String(id), label: name.trim() });
  }
  if (!groupSelect) return;
  const previous = groupSelect.value; groupSelect.replaceChildren();
  const first = el('option', 'Choisir un groupe', groupSelect); first.value = '';
  for (const g of Array.from(availableGroups.values()).sort((a,b) => a.label.localeCompare(b.label, 'fr', {numeric:true}))) {
    const option = el('option', groupLabel({group:g.label}), groupSelect); option.value = g.id;
  }
  groupSelect.value = availableGroups.has(previous) ? previous : '';
}
function syncScopeControls() {
  const single = scopeSelect.value === 'group'; licenceControl.hidden = single; groupControl.hidden = !single;
}
