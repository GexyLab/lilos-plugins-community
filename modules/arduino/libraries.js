import { readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

/**
 * The index of Arduino's libraries (library_index.json, about 60 MB: one entry per release) made
 * into a summary, one entry per library with its latest release: libs.json, rebuilt by a worker
 * thread after each update of the index (parsing the index would stop the kernel for a while).
 *
 *   entry { name, version, versions (newest first, at most 30), author, sentence, paragraph,
 *           category, architectures, types, website, includes (providesIncludes), deps: [name] }
 */
const MAX_RESULTS = 60;

const SUMMARIZE = `
const { parentPort, workerData } = require('node:worker_threads');
const { readFileSync, writeFileSync } = require('node:fs');
const index = JSON.parse(readFileSync(workerData.index, 'utf8'));
const cmp = (a, b) => {
  const pa = String(a).split(/[.+-]/), pb = String(b).split(/[.+-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '', y = pb[i] ?? '';
    const nx = Number(x), ny = Number(y);
    if (x !== y) return Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : String(x).localeCompare(String(y));
  }
  return 0;
};
const byName = new Map();
for (const r of index.libraries ?? []) {
  if (!r || typeof r.name !== 'string') continue;
  const e = byName.get(r.name) ?? { releases: [] };
  e.releases.push(r);
  byName.set(r.name, e);
}
const out = [];
for (const [name, { releases }] of byName) {
  releases.sort((a, b) => cmp(b.version, a.version));
  const r = releases[0];
  out.push({
    name, version: r.version, versions: releases.slice(0, 30).map(x => x.version),
    author: String(r.author ?? '').replace(/\\s*<[^>]*>/g, '').slice(0, 120),
    sentence: String(r.sentence ?? '').slice(0, 300), paragraph: String(r.paragraph ?? '').slice(0, 600),
    category: String(r.category ?? ''), architectures: Array.isArray(r.architectures) ? r.architectures : ['*'],
    types: Array.isArray(r.types) ? r.types : [], website: String(r.website ?? ''),
    includes: Array.isArray(r.providesIncludes) ? r.providesIncludes : [],
    deps: (r.dependencies ?? []).map(d => d.name).filter(Boolean),
  });
}
writeFileSync(workerData.out, JSON.stringify(out));
parentPort.postMessage(out.length);
`;

const avr = l => l.architectures.some(a => a === '*' || a === 'avr');
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export class Libraries {
  #dir; #log;
  #list = null;          // the summary, once loaded
  #loading = null;

  constructor(dir, log) {
    this.#dir = dir;
    this.#log = log;
  }

  get #file() { return join(this.#dir, 'libs.json'); }

  /** Rebuilds libs.json from the index (in a worker), then loads it. */
  async rebuild() {
    const index = join(this.#dir, 'library_index.json');
    if (!await stat(index).then(() => true, () => false)) return;
    const tmp = `${this.#file}.tmp`;
    await new Promise((resolve, reject) => {
      const worker = new Worker(SUMMARIZE, { eval: true, workerData: { index, out: tmp }, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', code => (code ? reject(new Error(`Riassunto dell'indice delle librerie non riuscito (${code})`)) : resolve()));
    });
    await rename(tmp, this.#file);
    this.#list = null;
    await this.load();
  }

  async load() {
    if (this.#list) return this.#list;
    this.#loading ??= (async () => {
      try {
        this.#list = JSON.parse(await readFile(this.#file, 'utf8'));
      } catch {
        // No summary yet (an index from before this version): make it
        this.#loading = null;
        const index = join(this.#dir, 'library_index.json');
        if (await stat(index).then(() => true, () => false)) { await this.rebuild(); return this.#list; }
        this.#list = [];
      }
      return this.#list;
    })().finally(() => { this.#loading = null; });
    return this.#loading;
  }

  topics() {
    return [...new Set((this.#list ?? []).map(l => l.category).filter(Boolean))].sort();
  }

  /** Words of the query in name, sentence, paragraph or author; best matches first. */
  async search(query, { type = 'all', topic = '', installed = new Map() } = {}) {
    const list = await this.load();
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const q = norm(query);
    const results = [];
    for (const l of list) {
      if (!avr(l)) continue;
      if (topic && l.category !== topic) continue;
      const have = installed.get(l.name) ?? null;
      if (type === 'installed' && !have) continue;
      if (type === 'updatable' && (!have || have === l.version)) continue;
      const hay = `${l.name} ${l.sentence} ${l.paragraph} ${l.author}`.toLowerCase();
      if (words.some(w => !hay.includes(w))) continue;
      const n = norm(l.name);
      const score = !q ? 0 : n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3;
      results.push({ score, official: l.types.includes('Arduino') ? 0 : 1, l, have });
    }
    results.sort((a, b) => a.score - b.score || a.official - b.official || a.l.name.localeCompare(b.l.name));
    return results.slice(0, MAX_RESULTS).map(({ l, have }) => ({
      name: l.name, version: l.version, versions: l.versions, author: l.author, sentence: l.sentence,
      category: l.category, website: l.website, installed: have, official: l.types.includes('Arduino'),
    }));
  }

  /**
   * Libraries that may provide `header`: the ones that declare it (providesIncludes, often missing)
   * or are named like it. Best guesses first: named exactly as the file, by a well-known author,
   * declaring it, starting like it, short names.
   */
  provides(header) {
    const list = this.#list ?? [];
    const base = norm(header.replace(/\.[^.]*$/, ''));
    const low = header.toLowerCase();
    const declares = l => l.includes.some(i => i.toLowerCase() === low);
    const candidates = list.filter(l => avr(l) && (declares(l) || (base.length >= 2 && !l.includes.length && norm(l.name).includes(base))));
    const known = l => (l.types.includes('Arduino') || l.types.includes('Recommended') || /^(adafruit|arduino|sparkfun)\b/i.test(l.author) ? 0 : 1);
    const rank = l => [norm(l.name) === base ? 0 : 1, known(l), l.includes.includes(header) ? 0 : declares(l) ? 1 : 2, norm(l.name).startsWith(base) ? 0 : 1, norm(l.name).length];
    const cmp = (a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]; return 0; };
    return candidates.sort(cmp).slice(0, 6).map(l => ({ name: l.name, version: l.version, author: l.author, sentence: l.sentence }));
  }
}

