import { createWriteStream, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { readFileSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = join(root, 'release', `dreamread-v${pkg.version}.zip`);

function addDir(archive, dir, base = dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(base, full).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) {
      addDir(archive, full, base);
    } else {
      archive.file(full, { name: rel });
    }
  }
}

await import('node:fs/promises').then(({ mkdir }) => mkdir(join(root, 'release'), { recursive: true }));

await new Promise((resolve, reject) => {
  const output = createWriteStream(out);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  addDir(archive, dist);
  archive.finalize();
});

console.log(`Packaged: ${out}`);
