/**
 * Intel HEX (what the compiler gives) → the program's bytes from address 0, gaps filled with 0xFF.
 * Records 00 (data), 01 (end), 02 (segment address) and 04 (linear address); 03 and 05 (start
 * address) are ignored. Every record's checksum is checked.
 */
export function parseHex(text, { max = 1 << 20 } = {}) {
  const bytes = new Uint8Array(max).fill(0xff);
  let base = 0, end = 0, line = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    line++;
    const rec = raw.trim();
    if (!rec) continue;
    if (!/^:([0-9A-Fa-f]{2})+$/.test(rec)) throw new Error(`HEX non valido alla riga ${line}`);
    const b = rec.slice(1).match(/../g).map(x => parseInt(x, 16));
    const count = b[0];
    if (b.length !== count + 5) throw new Error(`HEX non valido alla riga ${line}`);
    if (b.reduce((s, x) => (s + x) & 0xff, 0) !== 0) throw new Error(`HEX: somma di controllo sbagliata alla riga ${line}`);
    const addr = (b[1] << 8) | b[2], type = b[3], data = b.slice(4, 4 + count);
    if (type === 0x00) {
      const at = base + addr;
      if (at + count > max) throw new Error('Il programma è troppo grande per questa scheda');
      bytes.set(data, at);
      end = Math.max(end, at + count);
    } else if (type === 0x01) break;
    else if (type === 0x02) base = ((data[0] << 8) | data[1]) << 4;
    else if (type === 0x04) base = ((data[0] << 8) | data[1]) << 16;
  }
  return bytes.slice(0, end);
}
