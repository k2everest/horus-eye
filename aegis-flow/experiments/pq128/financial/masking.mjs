// PRIVATE polynomial masking experiment only. This is not a hiding commitment,
// a ZK protocol, a financial proof, or a constant-time implementation. Never
// serialize/log its coefficients or pass them to the current non-hiding FRI.
import crypto from 'node:crypto';
import {inspect} from 'node:util';
import {ZERO,add,sub,assertElement,fft} from '../fri/field.mjs';
import {decodeUniformChallenge512} from '../challenge-sampling.mjs';

const REJECTION_LIMIT=4;
function freshCoefficient() {
  for(let draw=0;draw<REJECTION_LIMIT;draw++) {
    const coefficient=decodeUniformChallenge512(crypto.randomBytes(64));
    if(coefficient!==null)return Object.freeze(coefficient);
  }
  throw new Error('MASKING_RANDOMNESS_REJECTION_LIMIT');
}

// R has maskCoefficients uniformly sampled coefficients, so degree(R) < r.
// M(X)=T(X)+(X^N-1)R(X), where T interpolates traceValues on the size-N
// subgroup. This preserves the trace and raises the strict degree bound to N+r.
// Fresh independent CSPRNG coins are mandatory; no caller-supplied seed/R.
export function maskTrace(traceValues,options) {
  if(!options||typeof options!=='object'||Array.isArray(options)||
    Object.keys(options).sort().join(',')!=='maskCoefficients')throw new TypeError('explicit maskCoefficients required');
  const {maskCoefficients:r}=options;
  if(!Number.isSafeInteger(r)||r<1||r>1024)throw new TypeError('mask coefficient count must be 1..1024');
  if(!Array.isArray(traceValues)||traceValues.length<1||traceValues.length>4096||
    (traceValues.length&(traceValues.length-1))!==0)throw new TypeError('trace length must be a power of two in 1..4096');
  for(const value of traceValues)assertElement(value);
  const n=traceValues.length;
  if(n+r>65536)throw new TypeError('masked polynomial exceeds coefficient budget');
  const original=fft(traceValues,true),coefficients=Array.from({length:n+r},()=>ZERO);
  for(let i=0;i<n;i++)coefficients[i]=original[i];
  for(let j=0;j<r;j++) {
    const random=freshCoefficient();
    coefficients[j]=sub(coefficients[j],random);
    coefficients[n+j]=add(coefficients[n+j],random);
  }
  // These guards prevent accidental whole-artifact logging/JSON serialization.
  // Explicitly extracting coefficients still exposes secrets; this is a local
  // private artifact, never a wire/proof object or a complete privacy boundary.
  const artifact={originalDegreeBound:n,maskingDegreeBound:r,maskedDegreeBound:n+r,traceSize:n};
  Object.defineProperties(artifact,{
    coefficients:{value:Object.freeze(coefficients),enumerable:false},
    toJSON:{value(){throw new Error('PRIVATE_MASKED_POLYNOMIAL_MUST_NOT_BE_SERIALIZED');}},
    [inspect.custom]:{value(){return '[PRIVATE masked polynomial; not a proof]';}},
  });
  return Object.freeze(artifact);
}

// Limited algebraic privacy lemma, NOT a protocol security claim: for k<=r
// distinct points z_i outside H, the map R -> ((z_i^N-1)R(z_i))_i is
// surjective (Vandermonde rank k and nonzero diagonal). Uniform R therefore
// makes those k fixed evaluations uniform and independent of T. General
// quotients, adaptive transcript messages, unsalted Merkle commitments, degree
// tests and all other observations require a separate whole-protocol analysis.
