import test from'node:test';import assert from'node:assert/strict';import{assertFreeSpace}from'./disk-space.mjs';
test('backup space guard includes reserve and refuses a snapshot before disk exhaustion',()=>{
 const readStats=()=>({bavail:10n,bsize:4096n});assert.throws(()=>assertFreeSpace('/unused',40000,{reserveBytes:1000,readStats}),/INSUFFICIENT_FREE_SPACE/);
 assert.deepEqual(assertFreeSpace('/unused',30000,{reserveBytes:1000,readStats}),{available_bytes:'40960',required_bytes:'31000'});
 assert.throws(()=>assertFreeSpace('/unused',NaN,{readStats}),/INVALID_BACKUP_SPACE_BUDGET/);
});
