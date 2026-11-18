import test from 'node:test';import assert from 'node:assert/strict';
import {noteWindow} from './note-window.mjs';import {createPrivateNote,spendOwner,noteNullifierV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
test('4097 unspent notes page safely, include deferred value and become spendable after freeing a slot',()=>{
 const secret='04'.repeat(32),owner=spendOwner(secret);const notes=Array.from({length:4097},(_,i)=>createPrivateNote({ownerTag:owner,value:1,randomness:i.toString(16).padStart(64,'0')}));
 const first=noteWindow({existing:[],spendSecret:secret,isSpent:()=>false});for(const n of notes)first.add(n,12);
 assert.equal(first.notes.size,4096);assert.equal(first.deferred.get('AEGIS').value,1n);assert.equal(first.firstDeferred,12);
 const spent=noteNullifierV2(notes[0],secret),next=noteWindow({existing:[...first.notes.values()],spendSecret:secret,isSpent:n=>n===spent});for(const n of notes)next.add(n,12);
 assert.equal(next.notes.size,4096);assert.equal(next.deferred.size,0);assert.ok([...next.notes.values()].some(n=>n.randomness===notes[4096].randomness));
});
