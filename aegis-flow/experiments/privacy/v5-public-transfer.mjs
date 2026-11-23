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
  if(!exact(value,keys))fail();
  // Read caller properties once and retain only checked primitive values.
  const {version,network_id,anchor_root,nullifiers,output_commitments,
    fee_atomic,asset_id,proof_program_id,encrypted_outputs}=value;
  const singleton=list=>{
    if(!Array.isArray(list))fail();
    const length=list.length;
    if(length!==1||!Object.hasOwn(list,0))fail();
    return list[0];
  };
  const nullifier=singleton(nullifiers),commitment=singleton(output_commitments),
    output=singleton(encrypted_outputs);
  if(version!==QUEER_V5_CANDIDATE_VERSION||
    typeof network_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(network_id)||
    asset_id!=='QUEER'||!validHex(anchor_root)||!validHex(proof_program_id)||
    typeof fee_atomic!=='string'||!DECIMAL_U53.test(fee_atomic)||
    !Number.isSafeInteger(Number(fee_atomic))||!validHex(nullifier)||!validHex(commitment))fail();
  // Only structural lengths. A real KEM encapsulation must be validated
  // cryptographically by the receiver; a random hex string is insufficient.
  if(!exact(output,['algorithm','kem_ciphertext_hex','one_time_view_tag']))fail();
  const {algorithm,kem_ciphertext_hex,one_time_view_tag}=output;
  if(algorithm!=='ML-KEM-1024'||typeof kem_ciphertext_hex!=='string'||
    !/^[0-9a-f]{3136}$/.test(kem_ciphertext_hex)||!validHex(one_time_view_tag))fail();
  return Object.freeze({
    schema:'QUEER_V5_PUBLIC_STATEMENT_STRUCTURAL_ONLY',
    statement:Object.freeze({
      version,network_id,anchor_root,
      nullifiers:Object.freeze([nullifier]),
      output_commitments:Object.freeze([commitment]),
      fee_atomic,asset_id,proof_program_id,
      encrypted_outputs:Object.freeze([
        Object.freeze({algorithm,kem_ciphertext_hex,one_time_view_tag})
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
