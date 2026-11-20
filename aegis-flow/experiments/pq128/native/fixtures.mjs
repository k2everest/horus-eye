// Generated test-only private notes. Never serialize the returned witness into
// logs or artifacts; only statements/receipts may leave the test process.
import {createSpendIdentity512,createNote512,noteCommitment512,nullifier512} from '../financial/notes.mjs';
import {buildNoteTree512} from '../financial/membership.mjs';
import {RELATION_VERSION,financialStatementDigest512} from '../financial/relation.mjs';
export function native512Fixture({leafCount=3,index=leafCount-1,value='105000000',outputValue='104999900',fee='100'}={}){
  const networkId='native512-laboratory',owner=createSpendIdentity512({networkId}),recipient=createSpendIdentity512({networkId});
  const input=createNote512({networkId,ownerTag:owner.owner_tag,value}),output=createNote512({networkId,ownerTag:recipient.owner_tag,value:outputValue});
  const commitment=noteCommitment512(input),commitments=Array.from({length:leafCount},(_,i)=>i===index?commitment:(i+1).toString(16).padStart(128,'0'));
  const tree=buildNoteTree512({networkId,commitments});
  const statement={version:RELATION_VERSION,network_id:networkId,asset_id:'QUEER',anchor_root:tree.root,anchor_leaf_count:leafCount,
    input_commitments:[commitment],output_commitments:[noteCommitment512(output)],nullifiers:[nullifier512({note:input,spendSecret:owner.spend_secret})],fee,transaction_binding:'ab'.repeat(64)};
  return {statement,witness:{inputs:[{note:input,spend_secret:owner.spend_secret,membership:tree.proof(index)}],outputs:[output]}};
}
export function expectedNative512Statement(statement){return {networkId:statement.network_id,anchorRoot:statement.anchor_root,
  anchorLeafCount:statement.anchor_leaf_count,transactionBinding:statement.transaction_binding,statementDigest:financialStatementDigest512(statement)};}
