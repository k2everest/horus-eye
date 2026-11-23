// Uniform field-coordinate decoder, not a Fiat-Shamir transcript or field
// multiplication. The caller must obtain new uniform blocks on rejection and
// analyze rejection/abort and oracle-call budgets in the complete protocol.
export const FIELD_PRIME=(1n<<64n)-(1n<<32n)+1n;
export const FIELD_CARDINALITY=FIELD_PRIME**5n;
export const BLOCK_SPACE=1n<<512n;
export const ACCEPTANCE_LIMIT=BLOCK_SPACE-(BLOCK_SPACE%FIELD_CARDINALITY);

export function decodeUniformChallenge512(block) {
  if(!(block instanceof Uint8Array)||block.length!==64)throw new TypeError('64-byte challenge block required');
  let value=BigInt('0x'+Buffer.from(block).toString('hex'));
  if(value>=ACCEPTANCE_LIMIT)return null;
  value%=FIELD_CARDINALITY;
  const coefficients=[];
  for(let i=0;i<5;i++){coefficients.push(value%FIELD_PRIME);value/=FIELD_PRIME;}
  return coefficients;
}
