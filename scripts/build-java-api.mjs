// Builds vendor/teavm/java-api.bin: the Java standard library API that the
// in-browser javac compiles against, taken from a JDK's lib/ct.sym.
//
// Why: the API description that ships with TeaVM's in-browser compiler is
// incomplete (Map.Entry, Throwable.getMessage and others can't be found),
// so the compiler rejects ordinary code. ct.sym holds the JDK's own API-only
// class stubs. TeaVM maps those calls to its own implementations when it
// builds the program, as it normally does.
//
// Run with a JDK installed:  node scripts/build-java-api.mjs [path/to/ct.sym]
// The output is committed, so this is only needed to regenerate it.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, inflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The newest release in a JDK 21 ct.sym: K = Java 20. */
const RELEASE = 'K';
const PACKAGES = ['java/lang/', 'java/util/', 'java/math/', 'java/io/'];

function findCtSym() {
  if (process.argv[2]) return process.argv[2];
  // The JDK prints its settings to stderr.
  const { stderr } = spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8' });
  const home = /java\.home = (.+)/.exec(stderr ?? '')?.[1];
  if (!home) throw new Error('Could not find the JDK. Pass the path to lib/ct.sym.');
  return join(home.trim(), 'lib', 'ct.sym');
}

/** Minimal zip reader: the central directory, then each entry (stored or deflated). */
function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: () => entries.keys(),
    read(name) {
      const e = entries.get(name);
      const lp = e.local;
      const start = lp + 30 + buf.readUInt16LE(lp + 26) + buf.readUInt16LE(lp + 28);
      const data = buf.subarray(start, start + e.size);
      return e.method === 0 ? data : inflateRawSync(data);
    },
  };
}

const ctSym = findCtSym();
const zip = readZip(readFileSync(ctSym));
const classes = new Map();
for (const name of zip.names()) {
  const [releases, module, ...rest] = name.split('/');
  const path = rest.join('/');
  if (module !== 'java.base' || !releases.includes(RELEASE) || !name.endsWith('.sig')) continue;
  if (!PACKAGES.some((p) => path.startsWith(p))) continue;
  classes.set(`${path.slice(0, -'.sig'.length)}.class`, zip.read(name));
}
classes.set('module-info.class', zip.read(`${RELEASE}/java.base/module-info.sig`));

// TeaVM's container: per class, u16 name length, name, u32 size, bytes; gzipped.
const parts = [];
for (const name of [...classes.keys()].sort()) {
  const n = Buffer.from(name, 'utf8');
  const body = classes.get(name);
  const head = Buffer.alloc(2 + n.length + 4);
  head.writeUInt16BE(n.length, 0);
  n.copy(head, 2);
  head.writeUInt32BE(body.length, 2 + n.length);
  parts.push(head, body);
}
const out = join(root, 'vendor', 'teavm', 'java-api.bin');
// mtime 0 in the gzip header keeps the output byte-for-byte reproducible.
writeFileSync(out, gzipSync(Buffer.concat(parts), { level: 9 }));
console.log(`Wrote ${classes.size} API classes to ${out}`);
