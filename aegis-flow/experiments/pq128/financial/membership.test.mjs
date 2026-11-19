import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNoteTree512,verifyMembership512} from './membership.mjs';
const commitments=Array.from({length:7},(_,i)=>(i+1).toString(16).padStart(128,'0'));
const networkId='experimental-net';
test('network/count-bound note tree handles one leaf and odd widths without ambiguous paths',()=>{
  for(const size of [1,2,3,7]){
    const tree=buildNoteTree512({networkId,commitments:commitments.slice(0,size)});
    for(let i=0;i<size;i++){
      const expected={networkId,anchorRoot:tree.root,anchorLeafCount:size,commitment:commitments[i]},membership=tree.proof(i);
      assert.equal(verifyMembership512({...expected,membership}),true);
      assert.equal(verifyMembership512({...expected,networkId:'other',membership}),false);
      assert.equal(verifyMembership512({...expected,anchorLeafCount:size+1,membership}),false);
      assert.equal(verifyMembership512({...expected,membership:{...membership,extra:true}}),false);
    }
    const copy=tree.proof(size-1);copy.siblings.push('00'.repeat(64));assert.equal(tree.proof(size-1).siblings.length,Math.ceil(Math.log2(size)));
  }
});
test('malformed paths, odd padding, position and commitment substitution fail closed',()=>{
  const tree=buildNoteTree512({networkId,commitments}),membership=tree.proof(6);
  const expected={networkId,anchorRoot:tree.root,anchorLeafCount:7,commitment:commitments[6]};
  for(const change of [{leaf_index:0},{leaf_index:7},{leaf_count:8},{commitment:commitments[0]},
    {siblings:membership.siblings.slice(1)},{siblings:['00'.repeat(64),...membership.siblings.slice(1)]},
    {siblings:membership.siblings.map(s=>s.toUpperCase())},{version:'AEGIS-MERKLE-V1'}])assert.equal(verifyMembership512({...expected,membership:{...membership,...change}}),false);
  assert.throws(()=>buildNoteTree512({networkId,commitments:[]}));
  assert.throws(()=>buildNoteTree512({networkId,commitments:[commitments[0],commitments[0]]}));
  assert.equal(verifyMembership512(null),false);assert.equal(verifyMembership512(undefined),false);
});
