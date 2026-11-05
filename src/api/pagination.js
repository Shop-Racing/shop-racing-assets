// Validation des réponses et pagination.
// Assemblé dans la même fermeture privée : voir README.md.
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
// Endpoint contract from the working portal implementation supplied by the user.
async function portalPages(base, kind, request, progress) {
  const result = [], seen = new Set(); let pages = 1;
  const cap = kind === 'group' ? 30 : 50;
  for (let page = 0; page < cap; page++) {
    const u = new URL(base);
    u.searchParams.set('limit', kind === 'group' ? '100' : (base.searchParams.get('limit') || '100'));
    u.searchParams.set('page', String(page));
    let envelope;
    try { envelope = listEnvelope(await request(u), kind); }
    catch (e) { e.partialRows = result.slice(); throw e; }
    const { rows, meta } = envelope;
    const signature = JSON.stringify(rows);
    if (rows.length && seen.has(signature)) throw new Error('Page répétée : recherche incomplète.');
    seen.add(signature); result.push(...rows); if (progress) progress(result.length);
    if (kind === 'group') { if (rows.length < 100) return result; }
    else {
      pages = Number(meta.pageSize) || 1;
      if (!Number.isInteger(pages) || pages < 1 || pages > cap) throw new Error('Pagination audio invalide ou trop volumineuse.');
      if (!rows.length && page + 1 < pages) throw new Error('Page audio vide avant la fin : recherche incomplète.');
      if (page + 1 >= pages) return result;
    }
  }
  throw new Error('Limite de pagination atteinte : recherche incomplète.');
}
