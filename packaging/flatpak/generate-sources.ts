// Generate checksum-pinned Flatpak download sources; never runs package scripts.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const lock = Bun.JSONC.parse(await Bun.file(`${root}/frontend/bun.lock`).text());
const nodeSources = [];
for (const [key, entry] of Object.entries(lock.packages) as [string, any[]][]) {
  const [identity, registry, metadata, integrity] = entry;
  if (metadata.os && !metadata.os.includes('linux')) continue;
  if (metadata.cpu && !metadata.cpu.includes('x64')) continue;
  if (metadata.libc && !metadata.libc.includes('glibc')) continue;
  if (registry || typeof integrity !== 'string' || !integrity.startsWith('sha512-')) {
    throw new Error(`Unsupported dependency source: ${key}`);
  }
  const split = identity.lastIndexOf('@');
  const name = identity.slice(0, split);
  const version = identity.slice(split + 1);
  const parts = key.match(/@[^/]+\/[^/]+|[^/]+/g)!;
  if (parts.some(part => part === '..' || part === '.')) throw new Error('Unsafe package path');
  nodeSources.push({
    type: 'archive',
    url: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`,
    sha512: Buffer.from(integrity.slice(7), 'base64').toString('hex'),
    dest: `frontend/node_modules/${parts.join('/node_modules/')}`,
  });
}
await Bun.write(`${import.meta.dir}/node-sources.json`, JSON.stringify(nodeSources, null, 2) + '\n');

const download = Bun.spawnSync(['go', 'mod', 'download', '-json'], { cwd: root });
if (download.exitCode) throw new Error(download.stderr.toString());
const modules = JSON.parse(`[${download.stdout.toString().trim().replace(/}\s*\n\s*{/g, '},{')}]`);
const goSources = [];
for (const mod of modules) {
  if (mod.Error || !mod.Zip || !mod.GoMod || !mod.Info) throw new Error(`Incomplete module ${mod.Path}`);
  const escaped = mod.Path.replace(/[A-Z]/g, (c: string) => `!${c.toLowerCase()}`);
  const version = mod.Version.replace(/[A-Z]/g, (c: string) => `!${c.toLowerCase()}`);
  for (const [ext, path] of [['zip', mod.Zip], ['mod', mod.GoMod], ['info', mod.Info]]) {
    const url = `https://proxy.golang.org/${escaped}/@v/${version}.${ext}`;
    // Go may rewrite cached .info JSON with Origin metadata. Hash proxy bytes,
    // not that locally rewritten representation.
    let bytes = readFileSync(path);
    if (ext === 'info') {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Proxy returned ${response.status}: ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    goSources.push({
      type: 'file', url,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      dest: `go/pkg/mod/cache/download/${escaped}/@v`, 'dest-filename': `${version}.${ext}`,
    });
  }
}
const verify = Bun.spawnSync(['go', 'mod', 'verify'], { cwd: root });
if (verify.exitCode) throw new Error(verify.stderr.toString());
await Bun.write(`${import.meta.dir}/go-sources.json`, JSON.stringify(goSources, null, 2) + '\n');
console.log(`Pinned ${nodeSources.length} npm archives and ${modules.length} Go modules for Linux x86_64.`);
