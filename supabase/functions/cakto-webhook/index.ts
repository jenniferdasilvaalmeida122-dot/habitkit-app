import {createCaktoHandler} from './webhook.mjs';
import {createCaktoApi} from './api-client.mjs';
import {reviewedCaktoContract} from './api-contract.mjs';
const env=(name:string)=>Deno.env.get(name);
const api=createCaktoApi(env,{contract:reviewedCaktoContract});
// CAKTO_MODE defaults to inspect. Unconfirmed order-response evidence blocks all grants.
// Disable gateway JWT only for this function; the body secret remains mandatory.
Deno.serve(createCaktoHandler(env,fetch,undefined,api.lookup));
