// LOCAL witness-relation interpreter for a future financial circuit. It consumes
// private data and MUST NOT be exposed as a proof verifier or network endpoint.
// Hash/membership checks below are host operations, not arithmetized SHA gadgets.
import {decodeHex} from '../../../libs/crypto-core/pqc-wrapper.mjs';
import {bindingDigest512} from '../bindings.mjs';
import {assertNote512,noteCommitment512,nullifier512,NOTE512_ASSET,MAX_NOTE512_VALUE} from './notes.mjs';
import {verifyMembership512} from './membership.mjs';
import {compileAmountCircuit,assignAmountWitness,checkAmountWitness} from './amount-circuit.mjs';

export const RELATION_VERSION='AEGIS_EXPERIMENT_RELATION512_V1';
const fields=['version','network_id','asset_id','anchor_root','anchor_leaf_count','input_commitments','output_commitments','nullifiers','fee','transaction_binding'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hash=h=>decodeHex(h,'public digest',64);
function feeValue(value){
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(value)||BigInt(value)>BigInt(MAX_NOTE512_VALUE))throw new TypeError('invalid fee');
}
export function assertFinancialStatement512(st){
  if(!exact(st,fields)||st.version!==RELATION_VERSION||st.asset_id!==NOTE512_ASSET||
    typeof st.network_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(st.network_id)||
    !Number.isSafeInteger(st.anchor_leaf_count)||st.anchor_leaf_count<1||st.anchor_leaf_count>65536)throw new TypeError('invalid public statement');
  hash(st.anchor_root);hash(st.transaction_binding);feeValue(st.fee);
  for(const field of ['input_commitments','output_commitments','nullifiers']){
    const a=st[field];if(!Array.isArray(a)||a.length<1||a.length>4||new Set(a).size!==a.length)throw new TypeError('invalid public list');
    for(const h of a)hash(h);
  }
  if(st.nullifiers.length!==st.input_commitments.length||st.input_commitments.some(c=>st.output_commitments.includes(c)))throw new TypeError('invalid public relation');
  return st;
}
export function financialStatementDigest512(statement){
  assertFinancialStatement512(statement);
  const ordered=Object.fromEntries(fields.map(key=>[key,statement[key]]));
  return bindingDigest512({domain:'FINANCIAL_STATEMENT',parts:[Buffer.from(JSON.stringify(ordered),'utf8')]});
}

export function checkTransferWitness512(input){
  try{
    const {statement:st,witness,expected}=input??{};
    assertFinancialStatement512(st);
    const statementDigest=financialStatementDigest512(st);
    // A transaction-binding label alone does not authenticate a recipient or
    // fee. Pin the ENTIRE public statement to an independently trusted digest.
    if(!exact(expected,['networkId','anchorRoot','anchorLeafCount','transactionBinding','statementDigest'])||
      expected.statementDigest!==statementDigest||expected.networkId!==st.network_id||expected.anchorRoot!==st.anchor_root||expected.anchorLeafCount!==st.anchor_leaf_count||expected.transactionBinding!==st.transaction_binding||
      !exact(witness,['inputs','outputs'])||!Array.isArray(witness.inputs)||!Array.isArray(witness.outputs)||
      witness.inputs.length!==st.input_commitments.length||witness.outputs.length!==st.output_commitments.length)throw new Error('relation mismatch');
    for(let i=0;i<witness.inputs.length;i++){
      const input=witness.inputs[i];
      if(!exact(input,['note','spend_secret','membership']))throw new Error('invalid input');
      assertNote512(input.note);
      if(input.note.network_id!==st.network_id||input.note.asset_id!==st.asset_id||noteCommitment512(input.note)!==st.input_commitments[i]||
        nullifier512({note:input.note,spendSecret:input.spend_secret})!==st.nullifiers[i]||
        !verifyMembership512({networkId:st.network_id,anchorRoot:st.anchor_root,anchorLeafCount:st.anchor_leaf_count,commitment:st.input_commitments[i],membership:input.membership}))throw new Error('invalid input relation');
    }
    for(let i=0;i<witness.outputs.length;i++){
      const note=witness.outputs[i];assertNote512(note);
      if(note.network_id!==st.network_id||note.asset_id!==st.asset_id||noteCommitment512(note)!==st.output_commitments[i])throw new Error('invalid output relation');
    }
    const circuit=compileAmountCircuit({inputs:witness.inputs.length,outputs:witness.outputs.length,fee:st.fee});
    const assignment=assignAmountWitness(circuit,{inputValues:witness.inputs.map(i=>i.note.value),outputValues:witness.outputs.map(o=>o.value)});
    if(!checkAmountWitness(circuit,assignment))throw new Error('amount constraint violation');
    return {valid:true,statement_digest:statementDigest,scope:'local-private-witness-relation-only',
      cryptographic_proof:false,hash_constraints_arithmetized:false,aegis_target_met:false,production_ready:false};
  }catch{return {valid:false,reason:'INVALID_PRIVATE_RELATION',cryptographic_proof:false,aegis_target_met:false,production_ready:false};}
}
