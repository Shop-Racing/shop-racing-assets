process.chdir(require('node:path').resolve(__dirname, '..'));
require('node:fs').mkdirSync('.test-output', {recursive:true});
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../archives.js');
async function main() {
  assert.equal(api.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert(api.AUDIO_PATH.test('/ptt/audio;jsessionid=SYNTHETIC_ONLY'));
  assert.equal(api.groupPath('/ptt/audio;jsessionid=SYNTHETIC_ONLY'), '/ptt/group;jsessionid=SYNTHETIC_ONLY');
  assert.equal(api.groupPath('/proxy/service/ptt/audio;jsessionid=SYNTHETIC_ONLY/'), '/proxy/service/ptt/group;jsessionid=SYNTHETIC_ONLY/');
  assert.equal(api.groupPath('/ptt/audio'), '/ptt/group');
  assert(!api.AUDIO_PATH.test('/ptt/audio-other;jsessionid=SYNTHETIC_ONLY'));
  assert.throws(() => api.groupPath('/ptt/user'));
  assert.deepEqual(api.roleLicense('MÉCANICIEN 123'), { role: 'MECANICIEN', license: '123' });
  for (const n of ['VOITURE 1234', 'AUTRE 123', 'VOITURE 123 test']) assert.notEqual(api.roleLicense(n)?.license, '123');
  assert.equal(api.roleLicense('INGENIEUR_123').license, '123');
  assert.equal(api.roleLicense('MECANO-123').license, '123');
  assert(!api.safeName('../../test?<x>').includes('/'));
  assert(api.safeName('CON').startsWith('audio_'));
  assert.equal(api.timestamp(1700000000), 1700000000000);
  assert.throws(() => api.listEnvelope({ error: 'secret' }, 'audio'), /refusée/);
  assert.throws(() => api.listEnvelope({ something: [] }, 'audio'), /non reconnu/);
  assert.deepEqual(api.listEnvelope({ data: { groups: [{ id: 1 }], total: 1 } }, 'group').rows, [{ id: 1 }]);
  const u = new URL('https://example.invalid/ptt/audio?limit=100');
  let calls = 0;
  const rows = await api.paginate(u, 'audio', async url => {
    calls++; const p = +url.searchParams.get('page');
    return { data: { list: p < 4 ? [{ id: p }] : [], count: p < 4 ? 1 : 0 } };
  });
  assert.equal(rows.length, 3); assert.equal(calls, 4); // Server ignores requested page size; count is not a total.
  await assert.rejects(api.paginate(u, 'audio', async () => [{ id: 1 }]), /répète/);
  await assert.rejects(api.paginate(u, 'audio', async url => ({ rows: +url.searchParams.get('page') === 1 ? [{ id: 1 }] : [], total: 3 })), /incomplète/);
  const offsets = [];
  await api.paginate(new URL('https://example.invalid/ptt/group?offset=100&limit=2'), 'group', async url => {
    const o = +url.searchParams.get('offset'); offsets.push(o);
    return { rows: o < 3 ? [{ id: o }] : [], total: 3 };
  });
  assert.deepEqual(offsets, [0, 1, 2]);
  const files = [
    { name: '00001_VOITURE_123.wav', bytes: new Uint8Array([82, 73, 70, 70, 0, 1, 2, 255]) },
    { name: '00002_INGENIEUR_123.mp3', bytes: new TextEncoder().encode('test ZIP payload é') }
  ];
  const zip = api.makeZip(files);
  fs.writeFileSync('.test-output/test-archive.zip', Buffer.from(await zip.arrayBuffer()));
  fs.writeFileSync('.test-output/expected-zip.json', JSON.stringify(files.map(f => ({ name: f.name, bytes: Array.from(f.bytes) }))));
  assert.throws(() => api.makeZip([]));
  const requests = [], headers = [];
  class XHR {
    open(...args) { requests.push(args); }
    setRequestHeader(...args) { headers.push(args); }
    send() { return 'sent'; }
  }
  const context = { window: {}, document: { body: null, getElementById() {}, addEventListener() {} }, XMLHttpRequest: XHR,
    location: { href: 'https://example.invalid/app', origin: 'https://example.invalid' },
    performance: { getEntriesByType: () => [] }, URL, Uint32Array, TextEncoder, Blob, setTimeout, fetch: async () => ({}) };
  vm.runInNewContext(fs.readFileSync('archives.js', 'utf8'), context);
  const x = new XHR(); x.open('GET', '/ptt/audio?session=synthetic-only'); x.setRequestHeader('Authorization', 'synthetic-only');
  assert.equal(x.send(), 'sent'); assert.equal(requests.length, 1); assert.equal(headers.length, 1);
  assert.equal(context.window.__shopRacingArchives.version, '1.7.1');
  for (const url of ['https://example.invalid/login', 'https://example.invalid/#/login?return=home', 'https://example.invalid/sign-in']) assert(api.loginRoute(url));
  assert.equal(api.loginRoute('https://example.invalid/data-center/login-records'), false);
  assert.equal(api.searchDate('2026-10-16T14:35'), '2026-10-16 14:35:00');
  assert.equal(api.searchDate('2026-02-30T12:00:00'), null);
  assert.equal(api.searchDate(''), null);
  assert.equal(api.recordingDates([{ time: new Date(2026, 9, 16, 15).getTime() }]), '2026-10-16');
  assert.equal(api.recordingDates([{ time: new Date(2026, 9, 17, 15).getTime() }, { time: new Date(2026, 9, 16, 15).getTime() }]), '2026-10-16_au_2026-10-17');
  const pcm = api.monoPCM({ length: 3, numberOfChannels: 2, getChannelData: () => new Float32Array([-1, 0, 1]) });
  assert.deepEqual(Array.from(pcm), [0, 128, 0, 0, 255, 127]);
  const header = api.wavHeader(12, 24000);
  assert.equal(new TextDecoder().decode(header.slice(0, 4)), 'RIFF');
  assert.equal(new DataView(header.buffer).getUint32(40, true), 12);
  fs.writeFileSync('.test-output/test-merged.wav', Buffer.concat([header, pcm, pcm]));
  assert(api.filename({ time: 1767261600000, group: 'VOITURE 837', user: 'PILOTE_03' }, 0, 'audio/wav').includes('VOITURE_837_PILOTE_03.wav'));
  assert.deepEqual(api.dropdownGroup('INGENIEUR 837 (188604)'), { id: '188604', label: 'INGENIEUR 837', role: 'INGENIEUR', license: '837' });
  assert.equal(api.dropdownGroup('INGENIEUR 837 (not-an-id)'), null);
  assert.deepEqual(api.dropdownGroup('RACE CONTROL FUNCUP (106594)'), { id: '106594', label: 'RACE CONTROL FUNCUP' });
  assert.deepEqual(api.dropdownGroup('RACE CONTROL LIGIER (121665)'), { id: '121665', label: 'RACE CONTROL LIGIER' });
  assert.equal(api.dropdownGroup('RACE CONTROL FUNCUP (51/0/0)'), null);
  const markers=[{start:0,end:2,index:0,time:100000},{start:2,end:5,index:1,time:200000}];
  assert.equal(api.timelinePosition(markers,1.5).time,101500);
  assert.equal(api.timelinePosition(markers,2).time,200000);
  assert.equal(api.timelinePosition(markers,99).time,203000);
  assert.equal(api.timelineSeek(markers,150000),2);
  assert.equal(api.timelineSeek(markers,201000),3);
  assert.equal(api.timelineSeek(markers,999999),5);
  assert.equal(api.timelineSeek(markers,0),0);
  assert.equal(api.timelinePosition([],0),null);
  console.log('PASS: CRC32, licence, safe filenames, timestamps, envelopes, pagination/offset/repetition/truncation, ZIP creation, XHR preservation.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });

