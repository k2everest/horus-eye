// Experimental R1CS relation only: no commitment/ownership gadget, no AIR, no
// proof system, no production admission, and no demonstrated PQ128 claim.
import {P} from '../fri/field.mjs';

export const MAX_AMOUNT = 9007199254740991n;
// The largest output sum plus public fee is 5*MAX_AMOUNT, below p. After
// range/positivity checks, zero modulo p is therefore exact integer balance.
if(5n*MAX_AMOUNT>=P)throw new Error('amount range would permit modular balance wrap');
const BITS = 53, WIRES_PER_AMOUNT = BITS + 2;
const compiled = new WeakSet();
const frozen = value => Object.freeze(value);
const mod = value => { const r=value%P;return r<0n?r+P:r; };
const term = (wire, coefficient) => frozen({wire,coefficient:mod(coefficient)});
const linear = terms => frozen(terms.map(([wire,coefficient])=>term(wire,coefficient)));
const ONE = linear([[0,1n]]), ZERO = linear([]);
function amount(value, allowZero) {
  if(typeof value!=='string'||value.length>16||!/^(0|[1-9][0-9]*)$/.test(value))throw new TypeError('canonical decimal amount required');
  const parsed=BigInt(value);
  if(parsed>MAX_AMOUNT||(!allowZero&&parsed===0n))throw new RangeError('amount out of range');
  return parsed;
}
function shapeCount(count) {
  if(!Number.isSafeInteger(count)||count<1||count>4)throw new RangeError('one to four amounts required per side');
  return count;
}
function trusted(circuit) {
  if(!circuit||!compiled.has(circuit))throw new TypeError('compile the independently trusted public shape and fee first');
}
function scalarInverse(value) {
  if(value===0n)throw new RangeError('zero has no inverse');
  let base=value, exponent=P-2n, result=1n;
  while(exponent){if(exponent&1n)result=result*base%P;base=base*base%P;exponent>>=1n;}
  return result;
}

// The application supplies EXPECTED counts and public fee, independently of the
// witness/proof. Recompile those public values; never deserialize a prover's
// constraints and treat them as an authorized relation. Compilation does not
// inspect private amounts and returns the same relation for every witness.
export function compileAmountCircuit({inputs,outputs,fee}) {
  shapeCount(inputs);shapeCount(outputs);const publicFee=amount(fee,true);
  const shape=frozen({inputs,outputs,fee:publicFee.toString()});
  const wires=[],constraints=[];
  const constrain=(kind,amountIndex,A,B,C)=>constraints.push(frozen({kind,amountIndex,A,B,C}));
  for(let i=0;i<inputs+outputs;i++){
    const first=1+i*WIRES_PER_AMOUNT;
    const bits=frozen(Array.from({length:BITS},(_,j)=>first+j));
    const value=first+BITS, inverse=value+1;
    wires.push(frozen({side:i<inputs?'input':'output',index:i<inputs?i:i-inputs,bits,value,inverse}));
    for(const bit of bits)constrain('boolean',i,linear([[bit,1n]]),linear([[bit,1n],[0,-1n]]),ZERO);
    constrain('reconstruction',i,linear([[value,1n],...bits.map((bit,j)=>[bit,-(1n<<BigInt(j))])]),ONE,ZERO);
    constrain('positive',i,linear(bits.map(bit=>[bit,1n])),linear([[inverse,1n]]),ONE);
  }
  constrain('balance',null,linear([...wires.map(({value},i)=>[value,i<inputs?1n:-1n]),[0,-publicFee]]),ONE,ZERO);
  const circuit=frozen({schema:'AEGIS_EXPERIMENT_AMOUNT_R1CS_V1',shape,
    witnessLength:1+(inputs+outputs)*WIRES_PER_AMOUNT,wires:frozen(wires),constraints:frozen(constraints)});
  compiled.add(circuit);
  return circuit;
}

export function assignAmountWitness(circuit,{inputValues,outputValues}) {
  trusted(circuit);
  if(!Array.isArray(inputValues)||!Array.isArray(outputValues)||inputValues.length!==circuit.shape.inputs||outputValues.length!==circuit.shape.outputs)throw new TypeError('amount counts differ from public circuit');
  const values=Array.from([...inputValues,...outputValues],value=>amount(value,false));
  const witness=Array(circuit.witnessLength).fill(0n);witness[0]=1n;
  values.forEach((value,i)=>{
    const layout=circuit.wires[i];let count=0n;
    layout.bits.forEach((wire,j)=>{const bit=(value>>BigInt(j))&1n;witness[wire]=bit;count+=bit;});
    witness[layout.value]=value;witness[layout.inverse]=scalarInverse(count);
  });
  // A witness can be assigned for an unbalanced request; the actual constraints
  // below, rather than an assignment-time host sum, must reject it.
  return frozen(witness);
}

export function checkAmountWitness(circuit,witness) {
  try{
    trusted(circuit);
    if(!Array.isArray(witness)||witness.length!==circuit.witnessLength||witness[0]!==1n)return false;
    for(const value of witness)if(typeof value!=='bigint'||value<0n||value>=P)return false;
    const evaluate=terms=>terms.reduce((sum,{wire,coefficient})=>(sum+coefficient*witness[wire])%P,0n);
    return circuit.constraints.every(({A,B,C})=>evaluate(A)*evaluate(B)%P===evaluate(C));
  }catch{return false;}
}
