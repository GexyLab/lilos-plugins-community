/**
 * The kernel module «arduino» (compiling, libraries, suggestions) through its WebSocket, which lilOS
 * opens for the app: lilos.kernel.channel('arduino', '/session') → MessagePort.
 *
 *   const b = await Backend.open(lilos)
 *   await b.call(op, params, onProgress)     → result; errors carry .code ('not_ready', 'forbidden'…)
 *   b.transport()                            a Transport for @codemirror/lsp-client
 *   b.onLspExit = code => …                  the language server stopped
 *   b.onClose = () => …                      the channel closed (kernel restarted, window closing)
 */
export class Backend {
  #port; #next = 1; #calls = new Map(); #lsp = new Set();
  closed = false;
  onLspExit = null;
  onClose = null;

  static async open(lilos) {
    const port = await lilos.kernel.channel('arduino', '/session');
    return new Backend(port);
  }

  constructor(port) {
    this.#port = port;
    port.onmessage = e => {
      if (typeof e.data !== 'string') return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'gone') return this.#gone();
      if (msg.ev === 'lsp') { const text = JSON.stringify(msg.message); this.#lsp.forEach(fn => fn(text)); return; }
      if (msg.ev === 'lspExit') { this.onLspExit?.(msg.code); return; }
      const call = this.#calls.get(msg.id);
      if (!call) return;
      if (msg.ev === 'progress') { call.progress?.(msg); return; }
      this.#calls.delete(msg.id);
      if (msg.error) call.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
      else call.resolve(msg.result);
    };
  }

  #gone() {
    if (this.closed) return;
    this.closed = true;
    for (const c of this.#calls.values()) c.reject(Object.assign(new Error('Il collegamento con il kernel si è chiuso'), { code: 'closed' }));
    this.#calls.clear();
    this.onClose?.();
  }

  call(op, params = {}, progress = null) {
    if (this.closed) return Promise.reject(Object.assign(new Error('Il collegamento con il kernel si è chiuso'), { code: 'closed' }));
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      this.#calls.set(id, { resolve, reject, progress });
      this.#port.postMessage(JSON.stringify({ ...params, id, op }));
    });
  }

  transport() {
    return {
      send: text => {
        if (this.closed) throw new Error('closed');
        this.#port.postMessage(JSON.stringify({ op: 'lsp', message: JSON.parse(text) }));
      },
      subscribe: fn => this.#lsp.add(fn),
      unsubscribe: fn => this.#lsp.delete(fn),
    };
  }

  close() { this.#port.close?.(); this.#gone(); }
}
