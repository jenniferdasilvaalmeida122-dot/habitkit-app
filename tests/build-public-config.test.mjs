import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
test('build consumes the exact GitHub Actions variable names and embeds only public settings',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=await mkdtemp(join(tmpdir(),'habitkit-public-build-'));
 try{
  for(const item of ['src','public','index.html','manifest.webmanifest','sw.js'])await cp(join(root,item),join(dir,item),{recursive:true});
  await writeFile(join(dir,'package.json'),'{"type":"module"}');
  const env={...process.env,HABITKIT_SUPABASE_URL:'https://example-project.supabase.co/',HABITKIT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_build_test_only'};
  execFileSync(process.execPath,[join(root,'scripts/build.mjs')],{cwd:dir,env,stdio:'pipe'});
  const config=(await import(pathToFileURL(join(dir,'dist/src/account-config.js')))).default;
  assert.deepEqual(config,{enabled:true,supabaseUrl:'https://example-project.supabase.co',publishableKey:'sb_publishable_build_test_only'});
  assert.match(await readFile(join(dir,'dist/index.html'),'utf8'),/src\/bootstrap\.js\?v=[a-f0-9]{12}/);
  const workflow=await readFile(join(root,'.github/workflows/deploy.yml'),'utf8');
  for(const name of ['HABITKIT_SUPABASE_URL','HABITKIT_SUPABASE_PUBLISHABLE_KEY'])assert.ok(workflow.includes('${{ vars.'+name+' }}'));
  assert.ok(workflow.includes('run: node scripts/check-supabase.mjs'));
  assert.throws(()=>execFileSync(process.execPath,[join(root,'scripts/build.mjs')],{cwd:dir,env:{...env,HABITKIT_SUPABASE_PUBLISHABLE_KEY:'sb_secret_NEVER_EMBED_THIS'},stdio:'pipe'}));
  assert.ok(!(await readFile(join(dir,'dist/src/account-config.js'),'utf8')).includes('NEVER_EMBED_THIS'));
 }finally{await rm(dir,{recursive:true,force:true})}
});
