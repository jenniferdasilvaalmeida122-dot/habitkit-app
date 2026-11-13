import {publicSupabaseConfig} from './supabase-config.mjs';
import {mkdir,copyFile,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of ['index.html','manifest.webmanifest','sw.js']) await copyFile(file,'dist/'+file);
await cp('src','dist/src',{recursive:true});
await cp('public','dist/public',{recursive:true});
// New content gets new asset URLs, so a previous browser/CDN cache cannot hide it.
const hash=createHash('sha256');
const config=publicSupabaseConfig();
if(config.enabled)await writeFile('dist/src/account-config.js','export default '+JSON.stringify(config)+';\n');
for(const name of ['bootstrap','account-config','accounts','account-store','cloud-data','vision-validation'])hash.update(await readFile('dist/src/'+name+'.js'));
for(const file of ['index.html','src/app.js','src/model.js','src/alter-ego.js','src/style.css','sw.js','manifest.webmanifest','public/logo.png']) hash.update(await readFile(file));
const revision=hash.digest('hex').slice(0,12);
let html=await readFile('dist/index.html','utf8');
for(const file of ['src/bootstrap.js','src/style.css']) html=html.replaceAll(`./${file}`,`./${file}?v=${revision}`);
await writeFile('dist/index.html',html);
for(const name of ['bootstrap','accounts','app','alter-ego','cloud-data','account-store']){let code=await readFile('dist/src/'+name+'.js','utf8');code=code.replace(/(['"])(\.\/[a-z-]+\.js)\1/g,(_,quote,path)=>quote+path+'?v='+revision+quote);await writeFile('dist/src/'+name+'.js',code)}
let app=await readFile('dist/src/app.js','utf8');
app=app.replace("from './model.js'",`from './model.js?v=${revision}'`);
app=app.replace("from './alter-ego.js'",`from './alter-ego.js?v=${revision}'`);
await writeFile('dist/src/app.js',app);
let worker=await readFile('dist/sw.js','utf8');
worker=worker.replace('habitkit-v4-',`habitkit-${revision}-`);
for(const file of ['src/app.js','src/bootstrap.js','src/account-config.js','src/accounts.js','src/account-store.js','src/cloud-data.js','src/vision-validation.js','src/model.js','src/alter-ego.js','src/style.css']) worker=worker.replaceAll(`'${file}'`,`'${file}?v=${revision}'`);
await writeFile('dist/sw.js',worker);
await writeFile('dist/version.json',JSON.stringify({revision})+'\n');
console.log(`Build pronto em dist/ — versão ${revision}`);
