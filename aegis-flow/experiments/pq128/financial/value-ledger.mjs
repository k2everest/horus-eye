// Isolated SHA-512 value-binding ledger experiment. NOT a consensus entry point.
// No mint, legacy bridge, or PQ128 release switch exists here. A trusted genesis
// allocation and independently verified native receipts are prerequisites.
import {decodeHex} from '../../../libs/crypto-core/pqc-wrapper.mjs';
import {buildNoteTree512,MAX_LEAVES} from './membership.mjs';
import {assertFinancialStatement512} from './relation.mjs';
import {Native512LaboratoryBackend,NATIVE512_SCHEME} from '../native/backend.mjs';

const NETWORK=/^[A-Za-z0-9_-]{1,64}$/;
const clone=value=>structuredClone(value);
const exact=(object,fields)=>object!==null&&typeof object==='object'&&!Array.isArray(object)&&
  Object.keys(object).sort().join(',')===[...fields].sort().join(',');
const invalid=reason=>new Error('VALUE512_'+reason);
function commitmentsFor(networkId,values){
  if(!NETWORK.test(networkId)||!Array.isArray(values)||values.length<1||values.length>MAX_LEAVES)
    throw new TypeError('bounded trusted genesis allocation required');
  const commitments=values.map(c=>{decodeHex(c,'SHA-512 commitment',64);return c;});
  if(new Set(commitments).size!==commitments.length)throw new TypeError('duplicate genesis commitment');
  return commitments;
}

// Supports a fake verifier only for explicitly isolated unit tests. Do not
// inject untrusted verification providers in any network or financial service.
export class ExperimentalValueLedger512 {
  #network;#backend;#commitments;#known;#spent;#nullifiers;#txids;#tree;
  #anchors;#anchorWindow;#lock=Promise.resolve();#fees=0n;
  constructor({networkId,genesisCommitments,anchorWindow=32,backend=new Native512LaboratoryBackend()}={}){
    const initial=commitmentsFor(networkId,genesisCommitments);
    if(!Number.isSafeInteger(anchorWindow)||anchorWindow<1||anchorWindow>1024)
      throw new TypeError('invalid anchor window');
    if(!backend||typeof backend.verify!=='function'||typeof backend.programId!=='string'||
      !/^[0-9a-f]{64}$/.test(backend.programId))throw new TypeError('trusted verifier required');
    this.#network=networkId;this.#backend=backend;this.#anchorWindow=anchorWindow;
    this.#commitments=initial;this.#known=new Set(initial);this.#spent=new Set();
    this.#nullifiers=new Set();this.#txids=new Set();
    this.#tree=buildNoteTree512({networkId,commitments:initial});
    this.#anchors=[{root:this.#tree.root,count:initial.length}];
  }
  get snapshot(){
    return Object.freeze({schema:'AEGIS_EXPERIMENT_VALUE_LEDGER512_V1',network_id:this.#network,
      root:this.#tree.root,leaf_count:this.#commitments.length,fees_total:this.#fees.toString(),
      spent_inputs:this.#spent.size,nullifiers_recorded:this.#nullifiers.size,
      accepted_transfers:this.#txids.size,production_ready:false,aegis_target_met:false});
  }
  inclusionProof(commitment){
    const index=this.#commitments.indexOf(commitment);
    if(index<0)throw invalid('UNKNOWN_NOTE');
    return this.#tree.proof(index);
  }
  async #apply({statement,proof}){
    assertFinancialStatement512(statement);
    if(statement.network_id!==this.#network)throw invalid('CROSS_NETWORK');
    const anchor=this.#anchors.find(a=>a.root===statement.anchor_root&&a.count===statement.anchor_leaf_count);
    if(!anchor)throw invalid('UNKNOWN_OR_EXPIRED_ANCHOR');
    if(statement.input_commitments.some(c=>!this.#known.has(c)||this.#spent.has(c)))
      throw invalid('UNKNOWN_OR_SPENT_INPUT');
    if(statement.output_commitments.some(c=>this.#known.has(c)) ||
      this.#commitments.length+statement.output_commitments.length>MAX_LEAVES)
      throw invalid('DUPLICATE_OUTPUT_OR_CAPACITY');
    if(statement.nullifiers.some(n=>this.#nullifiers.has(n)))throw invalid('REPLAYED_NULLIFIER');
    if(this.#txids.has(statement.transaction_binding))throw invalid('REPLAYED_TRANSACTION');
    // Proof format, verified program and receipt are all checked by the native
    // backend. No witness, note values or arbitrary "verified:true" flags
    // enter the public state machine.
    if(!exact(proof,['program_id','receipt','scheme','statement_digest'])||
      proof.scheme!==NATIVE512_SCHEME||proof.program_id!==this.#backend.programId)
      throw invalid('WRONG_PROOF_SUITE');
    const verified=await this.#backend.verify({statement,proof});
    if(verified?.valid!==true||verified.program_id!==this.#backend.programId||
      verified.engine_profile!=='RISC0-3.1.0-LABORATORY'||
      verified.aegis_target_met!==false||verified.production_ready!==false)
      throw invalid('PROOF_NOT_VERIFIED');
    const updated=[...this.#commitments,...statement.output_commitments];
    const tree=buildNoteTree512({networkId:this.#network,commitments:updated});
    // Atomic state assignment after *all* checks (including proof verification).
    for(const c of statement.input_commitments)this.#spent.add(c);
    for(const c of statement.output_commitments)this.#known.add(c);
    for(const n of statement.nullifiers)this.#nullifiers.add(n);
    this.#txids.add(statement.transaction_binding);
    this.#fees+=BigInt(statement.fee);
    this.#commitments=updated;this.#tree=tree;
    this.#anchors.push({root:tree.root,count:updated.length});
    if(this.#anchors.length>this.#anchorWindow)this.#anchors.shift();
    return this.snapshot;
  }
  applyTransfer(input){
    // Snapshot before enqueuing: no TOCTOU via caller mutation while queued.
    const frozen=clone(input);
    const next=this.#lock.then(()=>this.#apply(frozen));
    // Every transition is serialized even when a previous verification failed.
    this.#lock=next.then(()=>undefined,()=>undefined);
    return next;
  }
}
