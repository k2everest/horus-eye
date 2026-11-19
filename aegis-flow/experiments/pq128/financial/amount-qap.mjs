// PRIVATE arithmetic QAP experiment. This constructs polynomial divisibility,
// not a public proof, hiding commitment, AIR, or end-to-end PQ128 construction.
// The polynomials must never be published or fed to the non-hiding FRI module.
import {inspect} from 'node:util';
import {P,ZERO,fromBase,add,sub,mul,equal,fft} from '../fri/field.mjs';
import {checkAmountWitness} from './amount-circuit.mjs';
import {maskTrace} from './masking.mjs';

const frozen=value=>Object.freeze(value);
function nextPowerOfTwo(length){let size=1;while(size<length)size*=2;return size;}
function privateObject(properties,metadata,message){
  const object={...metadata};
  for(const [key,value] of Object.entries(properties))Object.defineProperty(object,key,{value,enumerable:false});
  Object.defineProperties(object,{
    toJSON:{value(){throw new Error('PRIVATE_AMOUNT_QAP_MUST_NOT_BE_SERIALIZED');}},
    [inspect.custom]:{value(){return message;}},
  });
  return frozen(object);
}

// Expected public circuit comes from compileAmountCircuit, not an untrusted
// proof's constraint list. Host validation and this private polynomial identity
// do not bind any future public commitments to a common valid witness: that is
// a separate missing proof-system component.
export function buildPrivateAmountQap(circuit,witness,options){
  if(!options||typeof options!=='object'||Array.isArray(options)||
      Object.keys(options).sort().join(',')!=='maskCoefficients')throw new TypeError('explicit maskCoefficients required');
  const r=options.maskCoefficients;
  if(!Number.isSafeInteger(r)||r<1||r>1024)throw new TypeError('mask coefficient count must be 1..1024');
  if(!checkAmountWitness(circuit,witness))throw new Error('INVALID_AMOUNT_WITNESS');
  const count=circuit.constraints.length,n=nextPowerOfTwo(count);
  if(n>4096)throw new RangeError('QAP constraint domain exceeds private masking budget');
  const values=()=>Array.from({length:n},()=>ZERO);
  const evalA=values(),evalB=values(),evalC=values();
  const evaluate=terms=>fromBase(terms.reduce((sum,{wire,coefficient})=>(sum+coefficient*witness[wire])%P,0n));
  circuit.constraints.forEach(({A,B,C},index)=>{evalA[index]=evaluate(A);evalB[index]=evaluate(B);evalC[index]=evaluate(C);});
  // Independent fresh randomness for each polynomial; these are not proof
  // transcript challenges and no caller-selected coins are accepted.
  const a=maskTrace(evalA,{maskCoefficients:r}).coefficients;
  const b=maskTrace(evalB,{maskCoefficients:r}).coefficients;
  const c=maskTrace(evalC,{maskCoefficients:r}).coefficients;
  const numeratorDegreeBound=a.length+b.length-1;
  const convolutionSize=nextPowerOfTwo(numeratorDegreeBound);
  if(convolutionSize>65536)throw new RangeError('QAP convolution exceeds FFT budget');
  const padded=coefficients=>Array.from({length:convolutionSize},(_,i)=>coefficients[i]??ZERO);
  const aValues=fft(padded(a)),bValues=fft(padded(b));
  const product=fft(aValues.map((value,i)=>mul(value,bValues[i])),true);
  // Padding to the full linear product length above avoids cyclic aliasing.
  for(let i=numeratorDegreeBound;i<product.length;i++)if(!equal(product[i],ZERO))throw new Error('QAP_CONVOLUTION_OVERFLOW');
  const remainder=Array.from({length:numeratorDegreeBound},(_,i)=>sub(product[i],c[i]??ZERO));
  const quotient=Array.from({length:numeratorDegreeBound-n},()=>ZERO);
  // Exact monic division by X^N-1, including contributions that overlap the
  // remainder repeatedly when the masking degree exceeds N.
  for(let i=remainder.length-1;i>=n;i--){
    const leading=remainder[i];quotient[i-n]=leading;
    remainder[i]=ZERO;remainder[i-n]=add(remainder[i-n],leading);
  }
  if(remainder.some(value=>!equal(value,ZERO)))throw new Error('QAP_NONZERO_REMAINDER');
  const polynomials=privateObject({a,b,c,quotient:frozen(quotient)},{},'[PRIVATE amount QAP polynomials; not a proof]');
  return privateObject({polynomials},{schema:'AEGIS_EXPERIMENT_PRIVATE_AMOUNT_QAP_V1',
    constraints:count,domainSize:n,maskCoefficients:r,
    maskedDegreeBound:n+r,numeratorDegreeBound,quotientDegreeBound:n+2*r-1,
    convolutionSize},'[PRIVATE amount QAP; not a proof]');
}
