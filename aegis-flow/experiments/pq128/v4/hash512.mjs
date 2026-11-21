// Candidate V4 only. This is a 512-BIT OUTER HASH layer, not a STARK,
// Fiat-Shamir compiler, actual proof verifier or demonstrated PQ128 system.
// Existing RISC Zero receipts keep SHA-256/Poseidon2 internally.
import {createHash} from 'node:crypto';

const PREFIX=Buffer.from('AEGIS_V4_OUTER_BINDING_SHA512\0','ascii');
const DOMAIN=/^AEGIS_V4_[A-Z0-9_]{1,52}$/;
const MAX_PART=1024*1024;
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const typed=x=>{
  if(!(x instanceof Uint8Array)||x.byteLength>MAX_PART)
    throw new TypeError('bounded Uint8Array required');
  return Buffer.from(x);
};
export function bytes512(value){
  if(typeof value!=='string'||!/^[0-9a-f]{128}$/.test(value))
    throw new TypeError('canonical 64-byte lowercase hash required');
  return Buffer.from(value,'hex');
}
export function frameV4(domain,parts){
  if(typeof domain!=='string'||!DOMAIN.test(domain)||!Array.isArray(parts)||
    parts.length>128)throw new TypeError('invalid V4 hash frame');
  const tag=Buffer.from(domain,'ascii');
  const chunks=parts.map(typed);
  return Buffer.concat([PREFIX,u32(tag.length),tag,u32(chunks.length),
    ...chunks.flatMap(x=>[u32(x.length),x])]);
}
export function digestV4(domain,parts){
  return createHash('sha512').update(frameV4(domain,parts)).digest('hex');
}
// Candidate program identity covers bytes supplied by an independent, pinned\n// build. The caller must establish source-to-binary equivalence separately.\nexport function programImageIdV4(imageBytes){\n  return digestV4('AEGIS_V4_PROGRAM_IMAGE',[imageBytes]);\n}\nexport function uint32BE(n){
  if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)throw new TypeError('u32 required');
  return u32(n);
}
export function ascii(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value))
    throw new TypeError('bounded ASCII identifier required');
  return Buffer.from(value,'ascii');
}
export function segmentClaimDigestV4({network_id,program_id,index,segment_count,pre_state,post_state,proof_commitment}){
  if(!Number.isSafeInteger(segment_count)||segment_count<1||segment_count>64||
    !Number.isSafeInteger(index)||index<0||index>=segment_count)
    throw new TypeError('invalid candidate segment position');
  return digestV4('AEGIS_V4_SEGMENT_CLAIM',[
    ascii(network_id),bytes512(program_id),uint32BE(index),uint32BE(segment_count),
    bytes512(pre_state),bytes512(post_state),bytes512(proof_commitment)]);
}
export function journalDigestV4(statement){
  // Statement has an already fixed canonical JSON order from the experimental
  // financial relation; never call this on an arbitrary unvalidated object.
  if(!statement||typeof statement!=='object'||Array.isArray(statement))
    throw new TypeError('validated statement required');
  const ordered=['version','network_id','asset_id','anchor_root','anchor_leaf_count',
    'input_commitments','output_commitments','nullifiers','fee','transaction_binding'];
  if(Object.keys(statement).sort().join(',')!==[...ordered].sort().join(','))
    throw new TypeError('unknown journal fields');
  return digestV4('AEGIS_V4_JOURNAL', [Buffer.from(JSON.stringify(Object.fromEntries(
    ordered.map(k=>[k,statement[k]])),'utf8')]);
}
