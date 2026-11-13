import test from 'node:test';
import assert from 'node:assert/strict';
import { packImages, unpackImages } from '../src/cloud-data.js';
import { selectAccount, habitsKey, visionDatabase } from '../src/account-store.js';
const user='11111111-1111-4111-8111-111111111111';
test('images are private, deduplicated by content and round trip without changing the source',async()=>{
 const image='data:image/png;base64,AQIDBA==', original={vision:{a:image,b:image},habits:{}};const paths=[];
 const packed=await packImages(original,user,async(path,bytes,type)=>{paths.push(path);assert.equal(type,'image/png');assert.deepEqual([...bytes],[1,2,3,4])});
 assert.equal(paths.length,1);assert.equal(packed.vision.a,packed.vision.b);assert.equal(original.vision.a,image);
 let downloads=0;const restored=await unpackImages(packed,user,async path=>{downloads++;assert.equal(path,paths[0]);return image});assert.deepEqual(restored,original);assert.equal(downloads,1);
 await assert.rejects(()=>unpackImages(packed,'22222222-2222-4222-8222-222222222222',async()=>image),/fora da conta/);
});
test('unknown private image references cannot be smuggled into a save',async()=>{await assert.rejects(()=>packImages({src:'hk-storage://other/path'},user,async()=>{}),/inesperada/)});
test('local user caches never reuse the anonymous data key or another account database',()=>{
 selectAccount(null);assert.equal(habitsKey(),'habitkit');const legacy=visionDatabase();selectAccount(user);const first=habitsKey();assert.notEqual(visionDatabase(),legacy);selectAccount('22222222-2222-4222-8222-222222222222');assert.notEqual(habitsKey(),first);selectAccount(null);
});
