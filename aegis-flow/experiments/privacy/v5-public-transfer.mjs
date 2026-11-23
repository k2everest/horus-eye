// Candidate only: public transaction envelope for linkability reduction.
// This is NOT a cryptographic proof, KEM decryption check, or consensus rule.
// All fields rejected unless explicitly required by a one-in/one-out
// shielded statement. Ownership and note membership MUST eventually be
// enforced by the authenticated financial STARK verifier.
export const QUEER_V5_CANDIDATE_VERSION='QUEER_SHIELDED_TRANSFER_V5_CANDIDATE';
const HEX512=/^[0-9a-f]{128}$/;
const DECIMAL_U53=/^(0|[1-9][0-9]{0,15})$/;
const exact=(value,keys)=>value&&typeof value==='object'&&
  !Array.isArray(value)&&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const fail=()=>{throw new TypeError('INVALID_QUEER_SHIELDED_V5_CANDIDATE');};
const validHex=value=>typeof value==='string'&&HEX512.test(value);

export function candidateV5PublicStatement(value){
  const keys=['version','network_id','anchor_root','nullifiers',
    'output_commitments','fee_atomic','asset_id','proof_program_id',
    'encrypted_outputs'];
  if(!exact(value,keys)||value.version!==QUEER_V5_CANDIDATE_VERSION||
    typeof value.network_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value.network_id)||
    value.asset_id!=='QUEER'||!validHex(value.anchor_root)||
    !validHex(value.proof_program_id)||!DECIMAL_U53.test(value.fee_atomic)||
    !Number.isSafeInteger(Number(value.fee_atomic))||
    !Array.isArray(value.nullifiers)||value.nullifiers.length!==1||
    !Array.isArray(value.output_commitments)||value.output_commitments.length!==1||
    value.nullifiers.some(x=>!validHex(x))||
    value.output_commitments.some(x=>!validHex(x))||
    !Array.isArray(value.encrypted_outputs)||value.encrypted_outputs.length!==1)fail();
  const output=value.encrypted_outputs[0];
  // Only structural lengths. A real KEM encapsulation must be validated
  // cryptographically by the receiver; a random hex string is insufficient.
  if(!exact(output,['algorithm','kem_ciphertext_hex','one_time_view_tag'])||
    output.algorithm!=='ML-KEM-1024'||
    typeof output.kem_ciphertext_hex!=='string'||
    !/^[0-9a-f]{3136}$/.test(output.kem_ciphertext_hex)||
    !validHex(output.one_time_view_tag))fail();
  return Object.freeze({
    schema:'QUEER_V5_PUBLIC_STATEMENT_STRUCTURAL_ONLY',
    statement:Object.freeze({
      version:value.version,network_id:value.network_id,
      anchor_root:value.anchor_root,
      nullifiers:Object.freeze([...value.nullifiers]),
      output_commitments:Object.freeze([...value.output_commitments]),
      fee_atomic:value.fee_atomic,asset_id:value.asset_id,
      proof_program_id:value.proof_program_id,
      encrypted_outputs:Object.freeze([
        Object.freeze({...output})
      ]),
    }),
    public_linkable_input_commitment_included:false,
    public_reusable_sender_key_included:false,
    KEM_ciphertext_authenticity_proved:false,
    one_time_view_tag_uniqueness_proved:false,
    ownership_and_membership_proved:false,
    zero_knowledge_proved:false,
    pq128_demonstrated:false,
    consensus_admitted:false,
  });
}
