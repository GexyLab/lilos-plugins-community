/**
 * The serial monitor's screen: lines of text as they arrive (UTF-8, split on \n, \r ignored),
 * what the user sent in another colour, an optional time before each line, at most MAX_LINES kept.
 */
const MAX_LINES = 5000;

export class MonitorView {
  #el; #decoder = new TextDecoder(); #partial = null; #count = 0;
  times = true;
  follow = true;

  constructor(el) {
    this.#el = el;
    el.addEventListener('scroll', () => {
      // Scrolling up stops following; back at the bottom it follows again
      this.follow = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      el.dispatchEvent(new CustomEvent('follow', { detail: this.follow }));
    });
  }

  #stamp() {
    const d = new Date();
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  }

  #line(kind) {
    const row = document.createElement('div');
    row.className = `mon-line ${kind}`;
    if (this.times) {
      const t = document.createElement('span');
      t.className = 'mon-time';
      t.textContent = this.#stamp();
      row.append(t);
    }
    const text = document.createElement('span');
    text.className = 'mon-text';
    row.append(text);
    this.#el.append(row);
    if (++this.#count > MAX_LINES) { this.#el.firstElementChild?.remove(); this.#count--; }
    return text;
  }

  #scroll() { if (this.follow) this.#el.scrollTop = this.#el.scrollHeight; }

  /** Bytes from the board. */
  data(bytes) {
    const text = this.#decoder.decode(bytes, { stream: true }).replace(/\r/g, '');
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) this.#partial = null;
      if (!part && i === parts.length - 1) return;
      this.#partial ??= this.#line('rx');
      this.#partial.textContent += part;
    });
    this.#scroll();
  }

  /** A line the user sent, or a note of the app ('sys'). */
  note(text, kind = 'sys') {
    this.#partial = null;
    this.#line(kind).textContent = text;
    this.#scroll();
  }

  clear() {
    this.#el.replaceChildren();
    this.#count = 0;
    this.#partial = null;
  }

  /** Everything shown, as text (to save it). */
  text() {
    return [...this.#el.children].map(r => [...r.children].map(c => c.textContent).join('  ')).join('\n');
  }
}
