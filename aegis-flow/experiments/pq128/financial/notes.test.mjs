import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTE512_VERSION, MAX_NOTE512_VALUE, assertNote512, createSpendIdentity512, ownerTag512,
  createNote512, noteCommitment512, nullifier512 } from './notes.mjs';

const networkId = 'aegis-experiment-a';
const identity = createSpendIdentity512({networkId});
const note = value => createNote512({networkId,ownerTag:identity.owner_tag,value});

test('real random identities and notes use 64 bytes, domain/network separation and canonical decimal strings', () => {
  const other = createSpendIdentity512({networkId}), first = note('1'), second = note('1');
  assert.match(identity.spend_secret,/^[0-9a-f]{128}$/); assert.match(identity.owner_tag,/^[0-9a-f]{128}$/);
  assert.notEqual(identity.spend_secret,other.spend_secret); assert.notEqual(identity.owner_tag,other.owner_tag);
  assert.notEqual(first.randomness,second.randomness); assert.match(first.randomness,/^[0-9a-f]{128}$/);
  assert.equal(first.version,NOTE512_VERSION); assert.equal(first.asset_id,'QUEER');
  assert.equal(ownerTag512({networkId,spendSecret:identity.spend_secret}),identity.owner_tag);
  assert.notEqual(ownerTag512({networkId:'aegis-experiment-b',spendSecret:identity.spend_secret}),identity.owner_tag);
  assert.equal(assertNote512(first),first);
  const commitment = noteCommitment512(first), nullifier = nullifier512({note:first,spendSecret:identity.spend_secret});
  assert.match(commitment,/^[0-9a-f]{128}$/); assert.match(nullifier,/^[0-9a-f]{128}$/);
  assert.equal(new Set([identity.owner_tag,commitment,nullifier]).size,3);
  assert.notEqual(commitment,noteCommitment512(second));
  assert.notEqual(commitment,noteCommitment512({...first,network_id:'aegis-experiment-b'}));
  assert.notEqual(commitment,noteCommitment512({...first,value:'2'}));
  assert.notEqual(commitment,noteCommitment512({...first,owner_tag:other.owner_tag}));
});

test('value ranges reject coercions, noncanonical decimals and unsafe/out-of-range values', () => {
  for (const value of ['1','2','2100000000000000',MAX_NOTE512_VALUE]) {
    const created = note(value); assert.equal(created.value,value); assert.doesNotThrow(()=>noteCommitment512(created));
  }
  for (const value of [0,1,1n,NaN,Infinity,undefined,null,'','0','-1','+1','01',' 1','1 ','1\n','1.0','1e3','1_000',
    '9007199254740992','10000000000000000','1'.repeat(100)]) assert.throws(()=>note(value));
});

test('schemas, versions, asset, network and byte encodings fail closed without legacy fallback', () => {
  const valid = note('5');
  for (const patch of [
    {version:'AEGIS-TRANSFER-V2'},{asset_id:'AEGIS'},{asset_id:'queer'},{network_id:''},{network_id:'x'.repeat(65)},
    {network_id:'bad|network'},{network_id:'bad\0network'},{network_id:'á'},
    {owner_tag:'AB'.repeat(64)},{owner_tag:'01'.repeat(32)},{randomness:'AB'.repeat(64)},
    {randomness:'01'.repeat(32)},{randomness:'gg'.repeat(64)},{extra:true},{anchor:'00'.repeat(64)},
  ]) assert.throws(()=>assertNote512({...valid,...patch}));
  for (const key of Object.keys(valid)) { const missing = {...valid}; delete missing[key]; assert.throws(()=>assertNote512(missing)); }
  for (const input of [null,undefined,[],{},'note']) assert.throws(()=>assertNote512(input));
  for (const networkId of ['',undefined,'x'.repeat(65),'bad|network']) assert.throws(()=>createSpendIdentity512({networkId}));
  for (const spendSecret of ['01'.repeat(32),'AB'.repeat(64),'zz'.repeat(64),undefined]) assert.throws(()=>ownerTag512({networkId,spendSecret}));
});

test('nullifiers enforce ownership and remain stable across repeated reads, backup copies and reorg-independent contexts', () => {
  const original = note('99'), input = {note:original,spendSecret:identity.spend_secret};
  const first = nullifier512(input), restored = JSON.parse(JSON.stringify(original));
  assert.equal(nullifier512(input),first);
  assert.equal(nullifier512({note:restored,spendSecret:identity.spend_secret}),first);
  assert.equal(noteCommitment512(restored),noteCommitment512(original));
  assert.notEqual(nullifier512({note:{...original,value:'100'},spendSecret:identity.spend_secret}),first);
  assert.notEqual(nullifier512({note:{...original,randomness:'00'.repeat(64)},spendSecret:identity.spend_secret}),first);
  const wrong = createSpendIdentity512({networkId});
  assert.throws(()=>nullifier512({...input,spendSecret:wrong.spend_secret}),/SPEND_SECRET_DOES_NOT_OWN_NOTE/);
  assert.throws(()=>nullifier512({...input,note:{...original,network_id:'aegis-experiment-b'}}),/SPEND_SECRET_DOES_NOT_OWN_NOTE/);
  const changedNetwork = createNote512({networkId:'aegis-experiment-b',
    ownerTag:ownerTag512({networkId:'aegis-experiment-b',spendSecret:identity.spend_secret}),value:original.value,randomness:original.randomness});
  assert.notEqual(nullifier512({note:changedNetwork,spendSecret:identity.spend_secret}),first);
});
