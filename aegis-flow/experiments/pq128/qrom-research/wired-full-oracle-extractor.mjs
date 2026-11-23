// Research only: deterministic extraction from COMPLETE private WiredAir trace rows.
// NOT a STARK/BCS/QROM extractor or financial proof.
import {createHash} from 'node:crypto';
import {inspect} from 'node:util';

const P=2013265921n,MAX_GATES=8_000_000,MAX_WIRES=8_388_608,MIN_ROWS=4096;
const V1=Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V1\0','ascii');
const V2=Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V2\0','ascii');
const programs=new WeakMap();
const sha512=b=>createHash('sha512').update(b).digest('hex');
const reject=()=>{throw new Error('INCONSISTENT_FULL_WIRED_ORACLES');};
const validHash=x=>typeof x==='string'&&/^[0-9a-f]{128}$/.test(x);
const nextPow2=n=>2**Math.ceil(Math.log2(n));

export function parseTrustedWiredProgram(bytes,expectedProgramSha512){
  if(!Buffer.isBuffer(bytes)||!validHash(expectedProgramSha512)||
     sha512(bytes)!==expectedProgramSha512)reject();
  const financial=bytes.subarray(0,V2.length).equals(V2);
  const magic=financial?V2:V1;
  if(bytes.length<magic.length+8||!bytes.subarray(0,magic.length).equals(magic))reject();
  const n=bytes.readUInt32BE(magic.length),m=bytes.readUInt32BE(magic.length+4);
  const start=magic.length+8+(financial?64:0);
  if(n<2||n>MAX_WIRES||n>=Number(P)||m<1||m>MAX_GATES||
     bytes.length!==start+13*m||3*m>=Number(P))reject();
  const rows=nextPow2(Math.max(n,m,MIN_ROWS));
  if(rows>2**23)reject();
  const gates=[],useCounts=new Uint32Array(n),outputs=new Uint8Array(n);
  for(let i=0;i<m;i++){
    const off=start+13*i;
    const op=bytes[off],a=bytes.readUInt32BE(off+1);
    const b=bytes.readUInt32BE(off+5),z=bytes.readUInt32BE(off+9);
    if(op<1||op>4||a>=n||b>=n||z>=n||
       (op===4&&z!==0)||(op===3&&b!==0)||
       (op!==4&&(z<2||outputs[z]!==0)))reject();
    if(op!==4)outputs[z]=1;
    for(const id of [a,b,z]){
      if(useCounts[id]+1>=Number(P))reject();
      useCounts[id]++;
    }
    gates.push({op,a,b,z});
  }
  const result=Object.freeze({
    schema:'AEGIS_WIRED_TRUSTED_PROGRAM_V1',
    program_sha512:expectedProgramSha512,
    financial,wire_count:n,gate_count:m,trace_rows:rows,
  });
  programs.set(result,{gates,useCounts});
  return result;
}

export function buildSyntheticFullTrace(program,bits){
  if(!programs.has(program)||!(bits instanceof Uint8Array)||
     bits.length!==program.wire_count)reject();
  const {gates}=programs.get(program),trace=new Uint8Array(program.trace_rows*4);
  for(let row=0;row<program.trace_rows;row++){
    const g=gates[row];
    if(g){
      trace[4*row]=bits[g.a];
      trace[4*row+1]=bits[g.b];
      trace[4*row+2]=bits[g.z];
    }
    trace[4*row+3]=row<bits.length?bits[row]:0;
  }
  return trace;
}

/** Conditional lemma: exact gate relations + exact lookup multiset
 *  imply one consistent global Boolean assignment.
 *  Source data are PRIVATE FULL oracles, never a succinct receipt.
 */
export function extractFromCompleteConsistentTrace(program,trace){
  if(!programs.has(program)||!(trace instanceof Uint8Array)||
     trace.length!==program.trace_rows*4)reject();
  const {gates,useCounts}=programs.get(program);
  const bits=new Uint8Array(program.wire_count);
  try{
    for(let row=0;row<program.trace_rows;row++){
      const off=4*row;
      for(let c=0;c<4;c++)if(trace[off+c]>1)reject();
      if(row<bits.length)bits[row]=trace[off+3];
      if(row>=gates.length&&
         (trace[off]!==0||trace[off+1]!==0||trace[off+2]!==0))reject();
    }
    if(bits[0]!==0||bits[1]!==1)reject();
    const seen=new Uint32Array(bits.length);
    for(let row=0;row<gates.length;row++){
      const g=gates[row],off=4*row;
      const vals=[trace[off],trace[off+1],trace[off+2]];
      const ids=[g.a,g.b,g.z];
      for(let j=0;j<3;j++){
        if(vals[j]!==bits[ids[j]])reject();
        seen[ids[j]]++;
      }
      const [a,b,z]=vals;
      const satisfied=(g.op===1&&z===a*b)||
        (g.op===2&&z===(a^b))||
        (g.op===3&&z===1-a)||
        (g.op===4&&a===b);
      if(!satisfied)reject();
    }
    for(let i=0;i<bits.length;i++)if(seen[i]!==useCounts[i])reject();
    const result={
      schema:'AEGIS_WIRED_FULL_ORACLE_CONDITIONAL_EXTRACTION_V1',
      full_private_oracle_access_required:true,
      exact_boolean_relations_checked:true,
      exact_lookup_multiset_checked:true,
      reads_checked:3*gates.length,
      financial_relation_proved:false,
      oracle_commitment_binding_proved:false,
      round_by_round_knowledge_proved:false,
      quantum_extractor_constructed:false,
      pq128_demonstrated:false,
      production_ready:false,
      dispose:()=>bits.fill(0),
    };
    Object.defineProperty(result,'privateWitnessBits',{value:bits,enumerable:false});
    Object.defineProperty(result,'toJSON',{value:()=>{
      throw new Error('PRIVATE_WITNESS_NOT_SERIALIZABLE');
    }});
    Object.defineProperty(result,inspect.custom,{value:()=>'[PRIVATE_WIRED_WITNESS_REDACTED]'});
    return Object.freeze(result);
  }catch(e){bits.fill(0);throw e;}
}

/** Fixed-oracle, uniform alpha/beta, nonzero multiplicity mod p ONLY. */
export function algebraicFingerprintBound({gateCount,wireCount,fieldDegree=8}={}){
  for(const n of [gateCount,wireCount,fieldDegree])
    if(!Number.isSafeInteger(n)||n<1)throw new RangeError('INVALID_BOUND_INPUT');
  if(gateCount>MAX_GATES||wireCount>MAX_WIRES||fieldDegree>32)
    throw new RangeError('INVALID_BOUND_INPUT');
  const T=BigInt(3*gateCount+wireCount);
  const num=T*(T-1n)/2n+2n*T;
  return Object.freeze({
    assumption:'fixed_full_oracles_before_uniform_independent_alpha_beta',
    bound:{numerator:num.toString(),denominator:(P**BigInt(fieldDegree)).toString()},
    subevent_only:true,rbr_knowledge_proved:false,
    qrom_proved:false,pq128_demonstrated:false,
  });
}