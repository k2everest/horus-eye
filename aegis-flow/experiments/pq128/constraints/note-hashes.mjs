// Symbolic SHA-512 bindings. These functions construct Boolean equations using
// sha512Bits; they never compute a host digest to stand in for a hash gadget.
// They do not supply a proof system, zero knowledge, or a PQ128 demonstration.
import {BitCircuit} from './bit-circuit.mjs';
import {sha512Bits} from './sha512.mjs';
import {BINDING_SUITE} from '../bindings.mjs';
import {NOTE512_VERSION,NOTE512_ASSET} from '../financial/notes.mjs';

const PREFIX=Buffer.from('AEGIS_BINDING_FRAME_V1\0','ascii');
const MAX_MESSAGE_BYTES=1024;
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
function builder(b){if(!(b instanceof BitCircuit))throw new TypeError('BitCircuit required');return b;}
function wireBytes(b,wires,length,label){
  builder(b).assertWires(wires);
  if(wires.length%8!==0||(length!==undefined&&wires.length!==length*8))throw new TypeError(`invalid ${label} bit width`);
  return wires;
}
function network(n){if(typeof n!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(n))throw new TypeError('invalid network');return Buffer.from(n,'ascii');}
const constant=(b,value)=>b.constantBytes(value);
const notePrefix=(b,networkId)=>[constant(b,Buffer.from(NOTE512_VERSION,'ascii')),constant(b,network(networkId)),constant(b,Buffer.from(NOTE512_ASSET,'ascii'))];

// Same byte frame as bindings.bindingFrame512: prefix, len32+suite,
// len32+domain, count32, and len32+part for each byte-aligned symbolic part.
// Lengths are public shape metadata; note values use fixed eight-byte encoding.
export function frameHashBits(b,{domain,parts}){
  builder(b);
  if(typeof domain!=='string'||!/^[A-Z][A-Z0-9_]{0,63}$/.test(domain)||!Array.isArray(parts)||parts.length>64)throw new TypeError('invalid constrained hash frame');
  const suite=Buffer.from(BINDING_SUITE,'ascii'),tag=Buffer.from(domain,'ascii');
  let size=PREFIX.length+4+suite.length+4+tag.length+4;
  for(const part of parts){wireBytes(b,part,undefined,'frame part');size+=4+part.length/8;}
  if(size>MAX_MESSAGE_BYTES)throw new RangeError('constrained hash message budget exceeded');
  const header=Buffer.concat([PREFIX,u32(suite.length),suite,u32(tag.length),tag,u32(parts.length)]);
  const framed=[...constant(b,header)];
  for(const part of parts)framed.push(...constant(b,u32(part.length/8)),...part);
  return sha512Bits(b,framed);
}

export function ownerHashBits(b,{networkId,spendSecretBits}){
  wireBytes(b,spendSecretBits,64,'spend secret');
  return frameHashBits(b,{domain:'NOTE512_OWNER',parts:[...notePrefix(b,networkId),spendSecretBits]});
}
export function noteHashBits(b,{networkId,valueBits,ownerBits,randomnessBits}){
  wireBytes(b,valueBits,8,'note value');wireBytes(b,ownerBits,64,'note owner');wireBytes(b,randomnessBits,64,'note randomness');
  return frameHashBits(b,{domain:'NOTE512_COMMITMENT',parts:[...notePrefix(b,networkId),valueBits,ownerBits,randomnessBits]});
}
export function nullifierHashBits(b,{networkId,commitmentBits,spendSecretBits}){
  wireBytes(b,commitmentBits,64,'commitment');wireBytes(b,spendSecretBits,64,'spend secret');
  return frameHashBits(b,{domain:'NOTE512_NULLIFIER',parts:[...notePrefix(b,networkId),commitmentBits,spendSecretBits]});
}
export function treeLeafHashBits(b,{networkId,commitmentBits}){
  wireBytes(b,commitmentBits,64,'commitment');
  return frameHashBits(b,{domain:'FINANCIAL_TREE_LEAF',parts:[constant(b,network(networkId)),commitmentBits]});
}
export function treeNodeHashBits(b,{networkId,leftBits,rightBits}){
  wireBytes(b,leftBits,64,'left digest');wireBytes(b,rightBits,64,'right digest');
  return frameHashBits(b,{domain:'FINANCIAL_TREE_NODE',parts:[constant(b,network(networkId)),leftBits,rightBits]});
}
export function treeRootHashBits(b,{networkId,leafCount,rootBits}){
  wireBytes(b,rootBits,64,'tree digest');
  if(!Number.isSafeInteger(leafCount)||leafCount<1||leafCount>65536)throw new TypeError('invalid leaf count');
  return frameHashBits(b,{domain:'FINANCIAL_TREE_ROOT',parts:[constant(b,network(networkId)),constant(b,u32(leafCount)),rootBits]});
}
