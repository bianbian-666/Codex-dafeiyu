import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {prepareData}=createRequire(import.meta.url)('../app-shell/runtime-utils.cjs');
const root=fileURLToPath(new URL('../app-shell/',import.meta.url));
const temp=()=>mkdtempSync(join(tmpdir(),'pet-quotes-upgrade-'));
const old='今天的小鱼干到账了吗？本鱼在线等。';

test('upgrade backs up the original, replaces only known defaults, adds once, and respects later deletions',()=>{
 const dir=temp(),file=join(dir,'quotes.json'),raw=JSON.stringify([old,'这是我自己写的句子','constructor','toString']);writeFileSync(file,raw);
 prepareData(root,dir);let quotes=JSON.parse(readFileSync(file,'utf8'));
 assert.ok(quotes.includes('这是我自己写的句子'));assert.ok(quotes.includes('constructor'));assert.ok(quotes.includes('toString'));assert.ok(quotes.includes('今天的 token 口粮到账了吗？本鱼端着饭碗等。'));
 assert.equal(readFileSync(join(dir,'quotes.before-white-rice-v1.json'),'utf8'),raw);
 quotes=quotes.filter(q=>q!=='饭可以再添，token 可不能乱花。');writeFileSync(file,JSON.stringify(quotes));
 prepareData(root,dir);assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),quotes);
});

test('custom-only and invalid quote files remain byte-for-byte unchanged',()=>{
 for(const raw of ['["只想保留自定义台词"]','invalid JSON']){
  const dir=temp(),file=join(dir,'quotes.json');writeFileSync(file,raw);prepareData(root,dir);assert.equal(readFileSync(file,'utf8'),raw);
 }
});

test('new installations get rice/token defaults without duplicated additions',()=>{
 const dir=temp();prepareData(root,dir);prepareData(root,dir);
 const quotes=JSON.parse(readFileSync(join(dir,'quotes.json'),'utf8'));
 assert.equal(quotes.length,22);assert.equal(new Set(quotes).size,22);assert.equal(quotes.includes(old),false);
});
