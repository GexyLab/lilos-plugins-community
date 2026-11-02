/**
 * A serial port opened by lilOS (lilos.serial.open → MessagePort, see lilOS's SDK serial.js) as
 * something to talk to: bytes come into a buffer, read(n) waits for them, signals() and sync()
 * wait for lilOS to have done them.
 */
export class Link {
  #port; #chunks = []; #size = 0; #wake = null; #next = 1; #done = new Map();
  closed = false;
  onData = null;      // (Uint8Array) for the monitor: then nothing is buffered
  onClose = null;     // (reason | null)

  constructor(port) {
    this.#port = port;
    port.onmessage = e => {
      if (e.data instanceof ArrayBuffer) {
        const bytes = new Uint8Array(e.data);
        if (this.onData) return this.onData(bytes);
        this.#chunks.push(bytes);
        this.#size += bytes.length;
        this.#wake?.();
        return;
      }
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'done') { this.#done.get(msg.id)?.(msg.error ?? null); this.#done.delete(msg.id); }
      else if (msg.t === 'error') this.error = msg.message;
      else if (msg.t === 'gone') {
        this.closed = true;
        this.#wake?.();
        this.#done.forEach(fn => fn('closed'));
        this.#done.clear();
        this.onClose?.(this.error ?? null);
      }
    };
  }

  write(bytes) {
    if (this.closed) throw new Error('La porta è chiusa');
    const copy = Uint8Array.from(bytes);
    this.#port.postMessage(copy.buffer, [copy.buffer]);
  }

  #control(msg) {
    if (this.closed) return Promise.reject(new Error('La porta è chiusa'));
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      this.#done.set(id, err => (err ? reject(new Error(err === 'closed' ? 'La porta si è chiusa' : err)) : resolve()));
      this.#port.postMessage(JSON.stringify({ ...msg, id }));
    });
  }

  signals(s) { return this.#control({ t: 'signals', ...s }); }
  sync() { return this.#control({ t: 'sync' }); }

  /** Throws away what arrived so far. */
  drain() { this.#chunks = []; this.#size = 0; }

  /** Exactly n bytes, or an error after `timeout` ms. */
  async read(n, timeout = 1000) {
    const until = Date.now() + timeout;
    while (this.#size < n) {
      if (this.closed) throw new Error('La porta si è chiusa');
      const left = until - Date.now();
      if (left <= 0) throw Object.assign(new Error('La scheda non risponde'), { code: 'timeout' });
      await new Promise(resolve => {
        const timer = setTimeout(resolve, left);
        this.#wake = () => { clearTimeout(timer); this.#wake = null; resolve(); };
      });
    }
    const out = new Uint8Array(n);
    let at = 0;
    while (at < n) {
      const c = this.#chunks[0];
      const take = Math.min(c.length, n - at);
      out.set(c.subarray(0, take), at);
      at += take;
      if (take === c.length) this.#chunks.shift(); else this.#chunks[0] = c.subarray(take);
    }
    this.#size -= n;
    return out;
  }

  close() {
    if (this.closed) return;
    this.#port.postMessage(JSON.stringify({ t: 'close' }));
  }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
