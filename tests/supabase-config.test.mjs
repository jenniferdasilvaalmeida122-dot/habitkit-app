import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSupabaseConfig} from '../scripts/supabase-config.mjs';
import {checkSupabase} from '../scripts/check-supabase.mjs';
const env={HABITKIT_SUPABASE_URL:' https://example-project.supabase.co/ ',HABITKIT_SUPABASE_PUBLISHABLE_KEY:' sb_publishable_test_key '};
test('public settings normalize the URL and do not accidentally enable accounts without configuration',()=>{
 assert.equal(publicSupabaseConfig({}).enabled,false);
 assert.deepEqual(publicSupabaseConfig(env),{enabled:true,supabaseUrl:'https://example-project.supabase.co',publishableKey:'sb_publishable_test_key'});
 for(const change of [{HABITKIT_SUPABASE_URL:''},{HABITKIT_SUPABASE_PUBLISHABLE_KEY:''},{HABITKIT_SUPABASE_PUBLISHABLE_KEY:'sb_secret_private'},{HABITKIT_SUPABASE_PUBLISHABLE_KEY:'eyJhbGciOiJIUzI1NiJ9.service_role'},{HABITKIT_SUPABASE_URL:'http://example-project.supabase.co'},{HABITKIT_SUPABASE_URL:'https://user:password@example-project.supabase.co'},{HABITKIT_SUPABASE_URL:'https://example-project.supabase.co/api'},{HABITKIT_SUPABASE_URL:'https://example-project.supabase.co?query=anything'}])assert.throws(()=>publicSupabaseConfig({...env,...change}));
});
test('preflight checks Auth settings, without granting access or modifying the project',async()=>{
 let calls=0;const good=async(url,options)=>{calls++;assert.equal(url,'https://example-project.supabase.co/auth/v1/settings');assert.equal(options.headers.apikey,'sb_publishable_test_key');assert.equal(options.method,undefined);return Response.json({external:{email:true},disable_signup:false,mailer_autoconfirm:false})};
 assert.equal((await checkSupabase({},good)).enabled,false);assert.equal(calls,0);
 assert.equal((await checkSupabase(env,good)).enabled,true);assert.equal(calls,1);
 for(const settings of [{external:{email:false},mailer_autoconfirm:false},{external:{email:true},mailer_autoconfirm:true},{external:{email:true},mailer_autoconfirm:false,disable_signup:true},{}])await assert.rejects(()=>checkSupabase(env,async()=>Response.json(settings)));
 await assert.rejects(()=>checkSupabase(env,async()=>new Response('',{status:401})));
 await assert.rejects(()=>checkSupabase(env,async()=>{throw Error('connection failed')}));
});
