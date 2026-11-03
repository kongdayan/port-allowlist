import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/expiry.ts'],bundle:true,format:'esm',write:false});const {expiry,midnight,localDay}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('expiry dates always end at UTC+8 midnight and calendar days cross months',()=>{
 const at=Date.parse('2026-11-02T15:00:00+08:00')/1000;
 assert.equal(expiry({days:30},at,365).expireDate,'2026-12-02');assert.equal(expiry({days:30},at,365).expiresAt,Date.parse('2026-12-02T00:00:00+08:00')/1000);
 assert.equal(expiry({expire_date:'2027-01-01'},at,365).expiresAt,Date.parse('2026-12-31T16:00:00Z')/1000);
 assert.equal(expiry({days:1},Date.parse('2026-11-02T23:59:59+08:00')/1000,365).expiresAt,Date.parse('2026-11-03T00:00:00+08:00')/1000);
 assert.equal(localDay(Date.parse('2026-11-02T16:00:00Z')/1000),'2026-11-03');
});
test('invalid, past, excessive and obsolete hourly grants are rejected',()=>{
 const at=Date.parse('2026-11-02T12:00:00+08:00')/1000;
 for(const data of [{expire_date:'2026-11-02'},{expire_date:'2026-02-30'},{expire_date:'2028-01-01'},{expire_date:'2026-11-03T00:00:00Z'},{days:0},{days:366},{hours:24}])assert.throws(()=>expiry(data,at,365));
 assert.throws(()=>midnight('2027-02-29'));assert.doesNotThrow(()=>midnight('2028-02-29'));
});

test('business time zone is independent and handles daylight-saving calendar boundaries',()=>{
 const start=Date.parse('2026-03-08T05:00:00Z')/1000;
 const value=expiry({days:1},start,365,'America/New_York');
 assert.equal(value.expireDate,'2026-03-09');assert.equal(value.expiresAt,Date.parse('2026-03-09T04:00:00Z')/1000);
 assert.equal(value.expiresAt-start,23*3600);
 const utc=expiry({expire_date:'2026-11-05'},Date.parse('2026-11-03T16:00:00Z')/1000,365,'UTC');
 assert.equal(utc.expiresAt,Date.parse('2026-11-05T00:00:00Z')/1000);
});
