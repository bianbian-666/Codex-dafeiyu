import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const backend=join(root,'backend');
const tool=join(backend,'node_modules','tsdown');
const pkg=JSON.parse(readFileSync(join(tool,'package.json'),'utf8'));
const bin=typeof pkg.bin==='string'?pkg.bin:pkg.bin.tsdown;
for(const script of [join(tool,bin),join(backend,'scripts','build-desktop-core.mjs')]) {
  execFileSync(process.execPath,[script],{cwd:backend,windowsHide:true,stdio:'inherit'});
}
