// Experimental Boolean/R1CS constraint builder. Witness generation and equation
// checking are not a proof system, a ZK protocol, a constant-time implementation,
// or a demonstrated PQ128 construction. No production code imports this file.
import {inspect} from 'node:util';
import {createHash} from 'node:crypto';
import {P} from '../fri/field.mjs';

const AND=1,XOR=2,NOT=3,EQUAL=4;
const MAX_GATES=8_000_000,MAX_INPUT_BYTES=262144;
const trusted=new WeakMap(),assignments=new WeakMap();
const circuitDigests=new WeakMap();
const freeze=value=>Object.freeze(value);
const byteArray=value=>value instanceof Uint8Array;
function bound(value,maximum,label){
  if(!Number.isSafeInteger(value)||value<1||value>maximum)throw new RangeError(`invalid ${label} bound`);
  return value;
}
function state(circuit){
  const data=trusted.get(circuit);
  if(!data)throw new TypeError('trusted sealed bit circuit required');
  return data;
}
function valuesFor(circuit,witness){
  const data=state(circuit);
  const values=byteArray(witness)?witness:assignments.get(witness);
  if(!values||values.length!==data.wireCount)throw new TypeError('exact bounded bit witness required');
  return values;
}
function equation(data,values,index){
  const a=values[data.a[index]],b=values[data.b[index]],z=values[data.z[index]];
  switch(data.ops[index]){
    case AND:return a*b-z;
    case XOR:return a+b-2*a*b-z;
    case NOT:return 1-a-z;
    case EQUAL:return a-b;
    default:throw new Error('unknown internal bit constraint');
  }
}

export class BitCircuit{
  #maxGates;#maxInputBytes;#wireCount=2;#gateCount=0;#inputBytes=0;
  #ops;#a;#b;#z;#inputs=new Map();#sealed=false;
  constructor({maxGates=MAX_GATES,maxInputBytes=MAX_INPUT_BYTES}={}){
    this.#maxGates=bound(maxGates,MAX_GATES,'gate');this.#maxInputBytes=bound(maxInputBytes,MAX_INPUT_BYTES,'input byte');
    const initial=Math.min(1024,this.#maxGates);
    this.#ops=new Uint8Array(initial);this.#a=new Uint32Array(initial);this.#b=new Uint32Array(initial);this.#z=new Uint32Array(initial);
  }
  get zero(){return 0;}
  get one(){return 1;}
  #mutable(){if(this.#sealed)throw new Error('bit circuit is sealed');}
  assertWire(wire){
    if(!Number.isSafeInteger(wire)||wire<0||wire>=this.#wireCount)throw new RangeError('invalid or future bit wire');
    return wire;
  }
  assertWires(wires){
    if(!Array.isArray(wires)||wires.length>MAX_INPUT_BYTES*8)throw new TypeError('bounded bit wire array required');
    for(const wire of wires)this.assertWire(wire);
    return wires;
  }
  #grow(){
    if(this.#gateCount<this.#ops.length)return;
    const size=Math.min(this.#maxGates,Math.max(1,this.#ops.length*2));
    const grow=(previous,Type)=>{const out=new Type(size);out.set(previous);return out;};
    this.#ops=grow(this.#ops,Uint8Array);this.#a=grow(this.#a,Uint32Array);
    this.#b=grow(this.#b,Uint32Array);this.#z=grow(this.#z,Uint32Array);
  }
  #gate(op,a,b=0){
    if(this.#gateCount>=this.#maxGates)throw new RangeError('bit gate budget exhausted');
    this.#grow();const z=op===EQUAL?0:this.#wireCount++;
    const i=this.#gateCount++;this.#ops[i]=op;this.#a[i]=a;this.#b[i]=b;this.#z[i]=z;
    return z;
  }
  constantBytes(value){
    this.#mutable();
    if(!Buffer.isBuffer(value)||value.length>MAX_INPUT_BYTES)throw new TypeError('bounded Buffer constant required');
    const wires=[];for(const byte of value)for(let bit=7;bit>=0;bit--)wires.push((byte>>bit)&1);
    return freeze(wires);
  }
  inputBytes(name,length){
    this.#mutable();
    if(typeof name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)||this.#inputs.has(name))throw new TypeError('unique input name required');
    if(!Number.isSafeInteger(length)||length<0||length>this.#maxInputBytes-this.#inputBytes)throw new RangeError('bit input byte budget exhausted');
    const first=this.#wireCount,wires=freeze(Array.from({length:8*length},(_,i)=>first+i));
    this.#wireCount+=8*length;this.#inputBytes+=length;
    this.#inputs.set(name,freeze({length,first}));return wires;
  }
  and(a,b){
    this.#mutable();this.assertWire(a);this.assertWire(b);
    if(a===b)return a;if(a===0||b===0)return 0;if(a===1)return b;if(b===1)return a;
    return this.#gate(AND,a,b);
  }
  xor(a,b){
    this.#mutable();this.assertWire(a);this.assertWire(b);
    if(a===b)return 0;if(a===0)return b;if(b===0)return a;if(a===1)return this.not(b);if(b===1)return this.not(a);
    return this.#gate(XOR,a,b);
  }
  not(a){
    this.#mutable();this.assertWire(a);if(a===0)return 1;if(a===1)return 0;
    return this.#gate(NOT,a);
  }
  assertEqual(a,b){
    this.#mutable();this.assertWire(a);this.assertWire(b);
    if(a!==b)this.#gate(EQUAL,a,b);
  }
  seal(){
    this.#mutable();this.#sealed=true;
    const inputByteLengths=freeze(Object.fromEntries([...this.#inputs].map(([name,{length}])=>[name,length])));
    const circuit=freeze({schema:'AEGIS_EXPERIMENT_BIT_R1CS_V1',wireCount:this.#wireCount,gateCount:this.#gateCount,
      inputByteLengths,booleanConstraintCount:this.#wireCount});
    // Transfer the compact stores without exposing typed-array mutation. All
    // builder mutations are forbidden after this point; no gate list is taken
    // from a witness or caller-supplied serialized circuit.
    trusted.set(circuit,{wireCount:this.#wireCount,gateCount:this.#gateCount,inputs:this.#inputs,
      ops:this.#ops,a:this.#a,b:this.#b,z:this.#z});
    return circuit;
  }
}

export function evaluateBitCircuit(circuit,inputsRecord){
  const data=state(circuit);
  if(!inputsRecord||typeof inputsRecord!=='object'||Array.isArray(inputsRecord)||
      Object.keys(inputsRecord).length!==data.inputs.size)throw new TypeError('exact named input bytes required');
  const values=new Uint8Array(data.wireCount);values[1]=1;
  for(const [name,{length,first}] of data.inputs){
    if(!Object.hasOwn(inputsRecord,name)||!byteArray(inputsRecord[name])||inputsRecord[name].length!==length)throw new TypeError('named input byte length mismatch');
    const source=inputsRecord[name];
    for(let i=0;i<length;i++)for(let bit=0;bit<8;bit++)values[first+8*i+bit]=(source[i]>>(7-bit))&1;
  }
  for(let i=0;i<data.gateCount;i++){
    const a=values[data.a[i]],b=values[data.b[i]];
    switch(data.ops[i]){
      case AND:values[data.z[i]]=a&b;break;
      case XOR:values[data.z[i]]=a^b;break;
      case NOT:values[data.z[i]]=1-a;break;
      case EQUAL:break; // Equality is an asserted relation, not an assignment.
      default:throw new Error('unknown internal bit operation');
    }
  }
  const assignment={schema:'AEGIS_EXPERIMENT_PRIVATE_BIT_ASSIGNMENT_V1',wireCount:data.wireCount};
  Object.defineProperties(assignment,{
    values:{value:values,enumerable:false},
    toJSON:{value(){throw new Error('PRIVATE_BIT_ASSIGNMENT_MUST_NOT_BE_SERIALIZED');}},
    [inspect.custom]:{value(){return '[PRIVATE bit assignment; not a proof]';}},
  });
  assignments.set(assignment,values);return freeze(assignment);
}

// The evaluator above computes a witness. This checker instead enforces the
// Boolean constraints and the arithmetic equations AND:ab=z,
// XOR:a+b-2ab=z, NOT:1-a=z, EQ:a-b=0. No hash primitive is recomputed here.
export function checkBitCircuit(circuit,witness){
  try{
    const data=state(circuit),values=valuesFor(circuit,witness);
    if(values[0]!==0||values[1]!==1)return false;
    for(const value of values)if(value*(value-1)!==0)return false;
    for(let i=0;i<data.gateCount;i++)if(equation(data,values,i)!==0)return false;
    return true;
  }catch{return false;}
}

// Residual of one arithmetic gate, for independent constraint diagnostics.
// Zero alone does not validate Booleanity, constants or the other gates.
export function evaluateGateConstraint(circuit,witness,gateIndex){
  const data=state(circuit),values=valuesFor(circuit,witness);
  if(!Number.isSafeInteger(gateIndex)||gateIndex<0||gateIndex>=data.gateCount)throw new RangeError('invalid bit gate index');
  return equation(data,values,gateIndex);
}

export function readBitBytes(circuit,witness,wires){
  const data=state(circuit),values=valuesFor(circuit,witness);
  if(!Array.isArray(wires)||wires.length%8!==0||wires.length>MAX_INPUT_BYTES*8)throw new TypeError('bounded whole-byte wire array required');
  const bytes=Buffer.alloc(wires.length/8);
  for(let i=0;i<wires.length;i++){
    const wire=wires[i];
    if(!Number.isSafeInteger(wire)||wire<0||wire>=data.wireCount||values[wire]>1)throw new TypeError('invalid bit wire or value');
    bytes[i>>3]|=values[wire]<<(7-(i&7));
  }
  return bytes;
}

const canonical=value=>{const result=value%P;return result<0n?result+P:result;};
function rowLinear(constant,terms=[]){
  const merged=new Map();
  for(const [wire,coefficient] of terms)merged.set(wire,canonical((merged.get(wire)??0n)+coefficient));
  return freeze({constant:canonical(constant),terms:freeze([...merged].filter(([,c])=>c!==0n)
    .sort(([a],[b])=>a-b).map(([wire,coefficient])=>freeze({wire,coefficient})))});
}
const ROW_ZERO=rowLinear(0n),ROW_ONE=rowLinear(1n);
const row=(A,B,C)=>freeze({A,B,C});

// Lazy public matrix view of the independently compiled circuit. No private
// assignment is read and no array containing millions of rows is materialized.
export function bitConstraintCount(circuit){
  const data=state(circuit);return 2+data.wireCount+data.gateCount;
}
export function bitConstraintRow(circuit,index){
  const data=state(circuit);
  if(!Number.isSafeInteger(index)||index<0||index>=2+data.wireCount+data.gateCount)throw new RangeError('invalid bit constraint row');
  if(index===0)return row(rowLinear(0n,[[0,1n]]),ROW_ONE,ROW_ZERO);
  if(index===1)return row(rowLinear(-1n,[[1,1n]]),ROW_ONE,ROW_ZERO);
  index-=2;
  if(index<data.wireCount)return row(rowLinear(0n,[[index,1n]]),rowLinear(-1n,[[index,1n]]),ROW_ZERO);
  index-=data.wireCount;
  const a=data.a[index],b=data.b[index],z=data.z[index];
  switch(data.ops[index]){
    case AND:return row(rowLinear(0n,[[a,1n]]),rowLinear(0n,[[b,1n]]),rowLinear(0n,[[z,1n]]));
    case XOR:return row(rowLinear(0n,[[a,2n]]),rowLinear(0n,[[b,1n]]),rowLinear(0n,[[a,1n],[b,1n],[z,-1n]]));
    case NOT:return row(rowLinear(1n,[[a,-1n]]),ROW_ONE,rowLinear(0n,[[z,1n]]));
    case EQUAL:return row(rowLinear(0n,[[a,1n],[b,-1n]]),ROW_ONE,ROW_ZERO);
    default:throw new Error('unknown internal bit constraint');
  }
}

// Snapshot first, then check the returned copy. Source Buffer.slice() would
// alias memory, so use Uint8Array.from. Gate validity is a separate obligation.
export function snapshotBitWitness(circuit,witness){
  const copy=Uint8Array.from(valuesFor(circuit,witness));
  if(copy[0]!==0||copy[1]!==1||copy.some(value=>value!==0&&value!==1))throw new TypeError('canonical Boolean witness with fixed pins required');
  return copy;
}

// Canonical streaming program identity, not a signature or proof. The gate
// semantics are bound explicitly so a later change of equations needs a new
// descriptor/version. All lengths/counts/indices are unsigned big-endian u32;
// the prime is fixed-width unsigned u64. Only populated gates are included.
export function bitCircuitDigest512(circuit){
  const data=state(circuit),cached=circuitDigests.get(circuit);if(cached)return cached;
  const h=createHash('sha512'),u32=value=>{const b=Buffer.alloc(4);b.writeUInt32BE(value);return b;};
  const framed=value=>{h.update(u32(value.length));h.update(value);};
  h.update(Buffer.from('AEGIS_EXPERIMENT_BIT_CIRCUIT_DIGEST512_V1\0','ascii'));
  const prime=Buffer.alloc(8);prime.writeBigUInt64BE(P);framed(prime);
  framed(Buffer.from(circuit.schema,'ascii'));
  framed(Buffer.from('PINS:w0=0,w1=1;BOOL:w*(w-1)=0;AND:a*b=z;XOR:(2*a)*b=a+b-z;NOT:(1-a)*1=z;EQ:(a-b)*1=0','ascii'));
  h.update(u32(data.wireCount));h.update(u32(data.gateCount));h.update(u32(data.inputs.size));h.update(u32(data.wireCount));
  for(const [name,{length,first}] of data.inputs){framed(Buffer.from(name,'ascii'));h.update(u32(length));h.update(u32(first));}
  const chunk=Buffer.alloc(13*1024);
  for(let start=0;start<data.gateCount;start+=1024){
    const count=Math.min(1024,data.gateCount-start);
    for(let i=0;i<count;i++){
      const gate=start+i,offset=13*i;chunk[offset]=data.ops[gate];
      chunk.writeUInt32BE(data.a[gate],offset+1);chunk.writeUInt32BE(data.b[gate],offset+5);chunk.writeUInt32BE(data.z[gate],offset+9);
    }
    h.update(chunk.subarray(0,count*13));
  }
  h.update(Buffer.from('END_BIT_CIRCUIT_V1\0','ascii'));
  const digest=h.digest('hex');circuitDigests.set(circuit,digest);return digest;
}
