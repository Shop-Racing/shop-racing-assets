// Encodage ZIP et WAV, sans réseau.
// Assemblé dans la même fermeture privée : voir README.md.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
function wavHeader(bytes, rate) {
  if (!Number.isInteger(bytes) || bytes < 0 || bytes > MAX_BYTES || bytes % 2) throw new Error('Taille WAV invalide.');
  const h = new Uint8Array(44), v = new DataView(h.buffer);
  const put = (offset, text) => Array.from(text).forEach((c, i) => { h[offset + i] = c.charCodeAt(0); });
  put(0, 'RIFF'); v.setUint32(4, bytes + 36, true); put(8, 'WAVE'); put(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  put(36, 'data'); v.setUint32(40, bytes, true); return h;
}
function monoPCM(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const pcm = new Uint8Array(buffer.length * 2), view = new DataView(pcm.buffer);
  for (let i = 0; i < buffer.length; i++) {
    let sample = 0; for (const channel of channels) sample += channel[i];
    sample = Math.max(-1, Math.min(1, sample / channels.length));
    view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return pcm;
}
// ZIP32, STORE method, UTF-8 names, CRC32, local headers + central directory + EOCD.
function makeZip(files) {
  if (!files.length || files.length > 65535) throw new Error('Nombre de fichiers ZIP non pris en charge.');
  const local = [], central = []; let offset = 0, centralSize = 0;
  for (const f of files) {
    const extension = /\.[a-z0-9]{1,8}$/i.exec(f.name)?.[0] || '';
    const name = new TextEncoder().encode(safeName(extension ? f.name.slice(0, -extension.length) : f.name) + extension);
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
