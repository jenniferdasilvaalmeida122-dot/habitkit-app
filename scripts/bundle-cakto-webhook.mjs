import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
const root=new URL('../supabase/functions/cakto-webhook/',import.meta.url);
const contract=await readFile(new URL('api-contract.mjs',root),'utf8');
const api=await readFile(new URL('api-client.mjs',root),'utf8');
const webhook=await readFile(new URL('webhook.mjs',root),'utf8');
const output=resolve(process.argv[2]||'/workspace/downloads/cakto-webhook-api-inspect.ts');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,'// BACKEND ONLY. Default mode: inspect; confirmed API endpoints; order evidence still blocked.\n'+contract+'\n'+api+'\n'+webhook+`\nif(typeof Deno!=='undefined'){
 const env=(name)=>Deno.env.get(name);
 const provider=createCaktoApi(env,{contract:reviewedCaktoContract});
 Deno.serve(createCaktoHandler(env,fetch,undefined,provider.lookup));
}\n`);
console.log('Arquivo único gerado, sem credenciais ou publicação: '+output);
