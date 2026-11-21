// Experimental, public-data FRI Merkle commitments. No salts or hiding claim,
// no financial circuit, no production acceptance and no end-to-end PQ128 claim.
import { bindingDigest512 } from '../bindings.mjs';

const DOMAIN = 'AEGIS_EXPERIMENT_FRI_MERKLE_V1';
const LEAF = Buffer.from('LEAF', 'ascii'), NODE = Buffer.from('NODE', 'ascii');
const isSize = size => Number.isSafeInteger(size) && size >= 2 && size <= 65536 && (size & (size - 1)) === 0;
const isIndex = (index,size) => Number.isSafeInteger(index) && index >= 0 && index < size;
const uint32 = value => { const out = Buffer.alloc(4); out.writeUInt32BE(value); return out; };
const isHex = (value,bytes) => typeof value === 'string' && value.length === bytes * 2 && /^[0-9a-f]+$/.test(value);
const indicesFor = (indices,size) => {
  if (!isSize(size) || !Array.isArray(indices) || !indices.length || indices.length > 131072) throw new TypeError('bounded nonempty Merkle indices required');
  for (const index of indices) if (!isIndex(index,size)) throw new TypeError('invalid Merkle index');
  return [...new Set(indices)].sort((left,right) => left-right);
};
const exact = (value,fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === fields;
const leaf = (size,index,value) => bindingDigest512({domain:DOMAIN,parts:[LEAF,uint32(size),uint32(index),value]});
const node = (size,level,left,right) => bindingDigest512({domain:DOMAIN,parts:[NODE,uint32(size),uint32(level),Buffer.from(left,'hex'),Buffer.from(right,'hex')]});

// The values are opaque canonical-width bytes. Finite-field canonicality is
// checked by the FRI caller; this module does not choose a field or byte order.
export function buildMerkle(values) {
  if (!Array.isArray(values) || !isSize(values.length)) throw new TypeError('power-of-two Merkle size 2..65536 required');
  for (const value of values) if (!Buffer.isBuffer(value) || value.length !== 40) throw new TypeError('40-byte Buffer values required');
  const size = values.length, stored = values.map(value => Buffer.from(value));
  const levels = [stored.map((value,index) => leaf(size,index,value))];
  for (let level = 1; levels.at(-1).length > 1; level++) {
    const previous = levels.at(-1), next = [];
    for (let i = 0; i < previous.length; i += 2) next.push(node(size,level,previous[i],previous[i+1]));
    levels.push(next);
  }
  return Object.freeze({root:levels.at(-1)[0],open(index) {
    if (!isIndex(index,size)) throw new TypeError('invalid Merkle index');
    const path = []; let position = index;
    for (let level = 0; level < levels.length - 1; level++) {
      path.push(levels[level][position ^ 1]); position = Math.floor(position / 2);
    }
    return {index,value:stored[index].toString('hex'),path};
  },openMany(indices) {
    const expected = indicesFor(indices,size);
    let frontier = new Set(expected); const nodes = [];
    for (let level = 0; level < levels.length - 1; level++) {
      const missing = new Set(), next = new Set();
      for (const position of frontier) {
        const sibling = position ^ 1;
        if (!frontier.has(sibling)) missing.add(sibling);
        next.add(Math.floor(position/2));
      }
      for (const index of [...missing].sort((a,b)=>a-b)) nodes.push({level,index,hash:levels[level][index]});
      frontier = next;
    }
    return {leaves:expected.map(index => ({index,value:stored[index].toString('hex')})),nodes};
  }});
}

export function verifyOpening(input) {
  try {
    const {root,size,index,opening} = input ?? {};
    if (!isSize(size) || !isIndex(index,size) || !isHex(root,64) ||
      !opening || typeof opening !== 'object' || Array.isArray(opening) ||
      Object.keys(opening).sort().join(',') !== 'index,path,value' || opening.index !== index ||
      !isHex(opening.value,40) || !Array.isArray(opening.path) || opening.path.length !== Math.log2(size)) return false;
    let digest = leaf(size,index,Buffer.from(opening.value,'hex')), position = index;
    for (let i = 0; i < opening.path.length; i++) {
      const sibling = opening.path[i]; if (!isHex(sibling,64)) return false;
      digest = position % 2 === 0 ? node(size,i+1,digest,sibling) : node(size,i+1,sibling,digest);
      position = Math.floor(position / 2);
    }
    return digest === root;
  } catch { return false; }
}

export function verifyMany(input) {
  try {
    const {root,size,indices,proof} = input ?? {};
    const expected = indicesFor(indices,size), depth = Math.log2(size);
    if (!isHex(root,64) || !exact(proof,'leaves,nodes') || !Array.isArray(proof.leaves) || !Array.isArray(proof.nodes) ||
      proof.leaves.length !== expected.length || proof.leaves.length + proof.nodes.length > 2*size) return false;
    let frontier = new Map();
    for (let i = 0; i < expected.length; i++) {
      const entry = proof.leaves[i];
      if (!exact(entry,'index,value') || entry.index !== expected[i] || !isHex(entry.value,40)) return false;
      frontier.set(entry.index,leaf(size,entry.index,Buffer.from(entry.value,'hex')));
    }
    const remaining = new Map(); let previousLevel = -1, previousIndex = -1;
    for (const entry of proof.nodes) {
      if (!exact(entry,'hash,index,level') || !Number.isSafeInteger(entry.level) || entry.level < 0 || entry.level >= depth ||
        !isIndex(entry.index,size / 2 ** entry.level) || !isHex(entry.hash,64) ||
        entry.level < previousLevel || (entry.level === previousLevel && entry.index <= previousIndex)) return false;
      previousLevel = entry.level; previousIndex = entry.index;
      remaining.set(`${entry.level}:${entry.index}`,entry.hash);
    }
    for (let level = 0; level < depth; level++) {
      const next = new Map();
      for (const position of [...frontier.keys()].sort((a,b)=>a-b)) {
        const parent = Math.floor(position/2); if (next.has(parent)) continue;
        const children = [parent*2,parent*2+1].map(index => {
          if (frontier.has(index)) return frontier.get(index);
          const key = `${level}:${index}`, hash = remaining.get(key);
          if (hash === undefined) throw new Error('missing Merkle sibling');
          remaining.delete(key); return hash;
        });
        next.set(parent,node(size,level+1,children[0],children[1]));
      }
      frontier = next;
    }
    return remaining.size === 0 && frontier.size === 1 && frontier.get(0) === root;
  } catch { return false; }
}
