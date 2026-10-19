import test from 'node:test';import assert from 'node:assert/strict';
let api={};try{api=await import('./compare-revisions.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
test('comparison requires exact commit IDs and distinct sides',()=>{for(const values of [{base:'master',head:'1'.repeat(40)},{base:'--unsafe',head:'1'.repeat(40)},{base:'1'.repeat(40),head:'1'.repeat(40)}])assert.throws(()=>api.validateComparison?.(values));});
test('valid exact base/head identities produce an immutable plan',()=>assert.equal(api.validateComparison?.({base:'0'.repeat(40),head:'1'.repeat(40)})?.ok,true));
