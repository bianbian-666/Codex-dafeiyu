import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const kind=process.argv[2];
if(!['patch','minor','major'].includes(kind))throw new Error('请选择 patch、minor 或 major');
const current=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const parts=current.split('.').map(Number);
if(parts.length!==3||parts.some(n=>!Number.isInteger(n)))throw new Error('版本号必须是 x.y.z');
if(kind==='major'){parts[0]++;parts[1]=parts[2]=0;}
else if(kind==='minor'){parts[1]++;parts[2]=0;}else parts[2]++;
const version=parts.join('.');
for(const file of ['package.json','package-lock.json','app-shell/package.json']){
 const full=join(root,file),raw=readFileSync(full,'utf8'),data=JSON.parse(raw);data.version=version;
 if(data.packages?.[''])data.packages[''].version=version;
 let text=JSON.stringify(data,null,2)+'\n';if(raw.includes('\r\n'))text=text.replaceAll('\n','\r\n');writeFileSync(full,text);
}
const panel=join(root,'app-shell/panel.html');
writeFileSync(panel,readFileSync(panel,'utf8').replace(/<span>v\d+\.\d+\.\d+ · 关闭窗口后留在托盘<\/span>/,`<span>v${version} · 关闭窗口后留在托盘</span>`));
console.log(`${current} -> ${version} (${kind})`);
