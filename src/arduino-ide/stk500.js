import { sleep } from './link.js';

/**
 * Uploading a program to an AVR board through its bootloader, as avrdude does with -D (no chip
 * erase: the bootloader erases each page it writes), then reading it back to verify.
 *
 *   STK500 v1 ("arduino" programmer): Optiboot of the Uno and of the new Nano, ATmegaBOOT of the old
 *             Nano and of the Mega 1280
 *   STK500 v2 ("wiring" programmer): stk500boot of the Mega 2560
 *
 * upload(link, image, params, progress) where link is an open Link (link.js) at params.speed,
 * image the program's bytes (hex.js), params from boards.js, progress({ step, done, total })
 * with step 'reset' | 'sync' | 'write' | 'verify'.
 */
export async function upload(link, image, params, progress = () => {}) {
  if (!image.length) throw new Error('Il programma è vuoto');
  if (image.length > params.flash) throw new Error(`Il programma (${image.length} byte) non entra nella scheda (${params.flash} byte)`);
  return params.protocol === 'stk500v2' ? v2(link, image, params, progress) : v1(link, image, params, progress);
}

/** The board resets when DTR/RTS go from off to on (a capacitor on the RESET pin). */
async function reset(link, { off = 250, on = 50 } = {}) {
  await link.signals({ dtr: false, rts: false });
  await sleep(off);
  await link.signals({ dtr: true, rts: true });
  await sleep(on);
  link.drain();
}

const pages = (image, size) => {
  const list = [];
  for (let at = 0; at < image.length; at += size) {
    const page = new Uint8Array(size).fill(0xff);
    page.set(image.subarray(at, Math.min(at + size, image.length)));
    list.push({ at, page });
  }
  return list;
};

const sameSignature = (sig, allowed) => allowed.some(a => a.every((v, i) => sig[i] === v));
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ');

// ---------- STK500 v1 ----------

const V1 = { OK: 0x10, INSYNC: 0x14, NOSYNC: 0x15, EOP: 0x20 };

async function v1cmd(link, bytes, extra = 0, timeout = 1000) {
  link.write([...bytes, V1.EOP]);
  const head = await link.read(1, timeout);
  if (head[0] === V1.NOSYNC) throw new Error('La scheda ha perso la sincronizzazione');
  if (head[0] !== V1.INSYNC) throw new Error(`Risposta inattesa della scheda (${hex(head)})`);
  const data = extra ? await link.read(extra, timeout) : new Uint8Array(0);
  const tail = await link.read(1, timeout);
  if (tail[0] !== V1.OK) throw new Error(`Risposta inattesa della scheda (${hex(tail)})`);
  return data;
}

async function v1(link, image, params, progress) {
  progress({ step: 'reset' });
  await reset(link);
  progress({ step: 'sync' });
  let synced = false;
  for (let attempt = 0; attempt < 10 && !synced; attempt++) {
    try {
      link.drain();
      await v1cmd(link, [0x30], 0, 200);                  // STK_GET_SYNC
      synced = true;
    } catch (err) {
      if (link.closed) throw err;
      await sleep(50);
    }
  }
  if (!synced) throw Object.assign(new Error('La scheda non risponde: controlla la porta, la scheda scelta e (per i Nano clone) il «vecchio bootloader»'), { code: 'nosync' });
  link.drain();
  // STK_SET_DEVICE and STK_SET_DEVICE_EXT: the bootloaders read and ignore them, avrdude sends them
  const pageSize = params.page;
  await v1cmd(link, [0x42, 0x86, 0, 0, 1, 1, 1, 1, 3, 0xff, 0xff, 0xff, 0xff, pageSize >> 8, pageSize & 0xff, 0x04, 0x00, 0, (params.flash >> 16) & 0xff, (params.flash >> 8) & 0xff, 0]);
  await v1cmd(link, [0x45, 0x05, 0x04, 0xd7, 0xc2, 0x00]);
  await v1cmd(link, [0x50]);                                // STK_ENTER_PROGMODE
  const sig = await v1cmd(link, [0x75], 3);                 // STK_READ_SIGN
  if (!sameSignature(sig, params.signature)) throw new Error(`La scheda ha un microcontrollore diverso da quello scelto (firma ${hex(sig)}): controlla la scheda e il processore`);
  const list = pages(image, pageSize);
  const address = at => { const w = at >> 1; return [0x55, w & 0xff, (w >> 8) & 0xff]; };   // STK_LOAD_ADDRESS (words)
  for (let i = 0; i < list.length; i++) {
    const { at, page } = list[i];
    await v1cmd(link, address(at));
    await v1cmd(link, [0x64, pageSize >> 8, pageSize & 0xff, 0x46, ...page], 0, 2000);   // STK_PROG_PAGE, 'F'
    progress({ step: 'write', done: i + 1, total: list.length });
  }
  for (let i = 0; i < list.length; i++) {
    const { at, page } = list[i];
    await v1cmd(link, address(at));
    const back = await v1cmd(link, [0x74, pageSize >> 8, pageSize & 0xff, 0x46], pageSize, 2000);   // STK_READ_PAGE
    const upto = Math.min(pageSize, image.length - at);
    for (let k = 0; k < upto; k++) if (back[k] !== page[k]) throw new Error(`Verifica non riuscita all'indirizzo 0x${(at + k).toString(16)}: la scheda ha letto un valore diverso`);
    progress({ step: 'verify', done: i + 1, total: list.length });
  }
  await v1cmd(link, [0x51]);                                // STK_LEAVE_PROGMODE: the program starts
  return { bytes: image.length, signature: hex(sig) };
}

// ---------- STK500 v2 ----------

const V2 = { START: 0x1b, TOKEN: 0x0e, OK: 0x00 };

async function v2cmd(link, seq, body, timeout = 1000) {
  const msg = [V2.START, seq & 0xff, body.length >> 8, body.length & 0xff, V2.TOKEN, ...body];
  msg.push(msg.reduce((x, b) => x ^ b, 0));
  link.write(msg);
  const head = await link.read(5, timeout);
  if (head[0] !== V2.START || head[4] !== V2.TOKEN) throw new Error(`Risposta inattesa della scheda (${hex(head)})`);
  if (head[1] !== (seq & 0xff)) throw new Error('La scheda ha risposto a un altro messaggio');
  const size = (head[2] << 8) | head[3];
  const rest = await link.read(size + 1, timeout);
  const all = [...head, ...rest];
  if (all.reduce((x, b) => x ^ b, 0) !== 0) throw new Error('Risposta della scheda rovinata (somma di controllo)');
  const answer = rest.subarray(0, size);
  if (answer[0] !== body[0]) throw new Error('Risposta della scheda a un altro comando');
  if (answer[1] !== V2.OK) throw new Error(`La scheda ha rifiutato il comando 0x${body[0].toString(16)} (stato 0x${answer[1].toString(16)})`);
  return answer;
}

async function v2(link, image, params, progress) {
  let seq = 0;
  const cmd = (body, timeout) => v2cmd(link, seq++, body, timeout);
  progress({ step: 'reset' });
  await reset(link, { off: 50, on: 50 });
  progress({ step: 'sync' });
  let synced = false;
  for (let attempt = 0; attempt < 10 && !synced; attempt++) {
    try {
      link.drain();
      await cmd([0x01], 300);                               // CMD_SIGN_ON
      synced = true;
    } catch (err) {
      if (link.closed) throw err;
      await sleep(50);
    }
  }
  if (!synced) throw Object.assign(new Error('La scheda non risponde: controlla la porta e la scheda scelta'), { code: 'nosync' });
  link.drain();
  // CMD_ENTER_PROGMODE_ISP with the parameters of the ATmega2560
  await cmd([0x10, 200, 100, 25, 32, 0, 0x53, 3, 0xac, 0x53, 0x00, 0x00]);
  const sig = [];
  for (let i = 0; i < 3; i++) sig.push((await cmd([0x1b, 4, 0x30, 0x00, i, 0x00]))[2]);   // CMD_READ_SIGNATURE_ISP
  if (!sameSignature(sig, params.signature)) throw new Error(`La scheda ha un microcontrollore diverso da quello scelto (firma ${hex(sig)}): controlla la scheda e il processore`);
  const pageSize = params.page;
  const list = pages(image, pageSize);
  const big = params.flash > 0x20000;                       // beyond 128 KB: extended addressing (bit 31)
  const address = at => { const w = at >> 1; return [0x06, ((w >> 24) & 0xff) | (big ? 0x80 : 0), (w >> 16) & 0xff, (w >> 8) & 0xff, w & 0xff]; };   // CMD_LOAD_ADDRESS
  for (let i = 0; i < list.length; i++) {
    const { at, page } = list[i];
    await cmd(address(at));
    await cmd([0x13, pageSize >> 8, pageSize & 0xff, 0xc1, 10, 0x40, 0x4c, 0x20, 0x00, 0x00, ...page], 2000);   // CMD_PROGRAM_FLASH_ISP
    progress({ step: 'write', done: i + 1, total: list.length });
  }
  for (let i = 0; i < list.length; i++) {
    const { at, page } = list[i];
    await cmd(address(at));
    const answer = await cmd([0x14, pageSize >> 8, pageSize & 0xff, 0x20], 2000);   // CMD_READ_FLASH_ISP
    const back = answer.subarray(2, 2 + pageSize);
    const upto = Math.min(pageSize, image.length - at);
    for (let k = 0; k < upto; k++) if (back[k] !== page[k]) throw new Error(`Verifica non riuscita all'indirizzo 0x${(at + k).toString(16)}: la scheda ha letto un valore diverso`);
    progress({ step: 'verify', done: i + 1, total: list.length });
  }
  await cmd([0x11, 1, 1]);                                  // CMD_LEAVE_PROGMODE_ISP
  return { bytes: image.length, signature: hex(sig) };
}
