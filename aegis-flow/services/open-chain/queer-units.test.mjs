import test from 'node:test';
import assert from 'node:assert/strict';
import {AEGIS_PER_QUEER,MAX_QUEER,MAX_AEGIS,parseQueerAmount,queerAmountParts,formatQueerAmountExact} from './queer-units.mjs';

test('requested supply fits exact integer ranges and converts the denomination without rounding',()=>{
 assert.equal(AEGIS_PER_QUEER,105000000n);assert.equal(MAX_QUEER,20000000n);assert.equal(MAX_AEGIS,2100000000000000n);
 assert.ok(MAX_AEGIS<=BigInt(Number.MAX_SAFE_INTEGER));assert.ok(MAX_AEGIS<2n**64n);
 assert.equal(parseQueerAmount('1'),'105000000');assert.equal(parseQueerAmount('1.5'),'157500000');assert.equal(parseQueerAmount('20000000'),MAX_AEGIS.toString());
 assert.equal(parseQueerAmount('0.0000002'),'21');
});
test('atomic balances are displayed exactly even when the QUEER decimal expansion repeats',()=>{
 assert.deepEqual(queerAmountParts('105000001'),{queer:'1',aegis_remainder:'1'});
 assert.equal(formatQueerAmountExact('1'),'1 AEGIS');assert.equal(formatQueerAmountExact('105000001'),'1 QUEER + 1 AEGIS');
 assert.equal(formatQueerAmountExact(MAX_AEGIS.toString()),'20000000 QUEER');
});
test('fractional atomic units, unsafe input types and amounts over the cap are rejected',()=>{
 for(const value of ['0.0000001','0.00000001'])assert.throws(()=>parseQueerAmount(value),/FRACTIONAL_AEGIS/);
 for(const value of ['-1','1e3','01','1,5',1,NaN])assert.throws(()=>parseQueerAmount(value));
 assert.throws(()=>parseQueerAmount('20000000.1'),/CAP/);assert.throws(()=>formatQueerAmountExact((MAX_AEGIS+1n).toString()),/CAP/);
});
