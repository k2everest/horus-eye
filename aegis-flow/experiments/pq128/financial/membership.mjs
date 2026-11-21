// Experimental note-tree relation, evaluated with the witness locally. These
// SHA-512 calls are NOT arithmetized constraints or a zero-knowledge verifier.
import {bindingDigest512} from '../bindings.mjs';
import {decodeHex} from '../../../libs/crypto-core/pqc-wrapper.mjs';
export const MEMBERSHIP_VERSION='AEGIS_EXPERIMENT_MEMBERSHIP512_V1';
export const MAX_LEAVES=65536;
const network=n=>{if(typeof n!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(n))throw new TypeError('invalid network');return Buffer.from(n,'ascii');};
const count=n=>{if(!Number.isSafeInteger(n)||n<1||n>MAX_LEAVES)throw new TypeError('invalid leaf count');const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const digest=d=>decodeHex(d,'digest',64);
const leaf=(net,c)=>bindingDigest512({domain:'FINANCIAL_TREE_LEAF',parts:[network(net),digest(c)]});
const node=(net,l,r)=>bindingDigest512({domain:'FINANCIAL_TREE_NODE',parts:[network(net),digest(l),digest(r)]});
const root=(net,n,r)=>bindingDigest512({domain:'FINANCIAL_TREE_ROOT',parts:[network(net),count(n),digest(r)]});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;

export function buildNoteTree512({networkId,commitments}){
  network(networkId);
  if(!Array.isArray(commitments))throw new TypeError('commitments required');
  count(commitments.length);
  const saved=commitments.map(c=>{digest(c);return c;});
  if(new Set(saved).size!==saved.length)throw new TypeError('duplicate commitments');
  const levels=[saved.map(c=>leaf(networkId,c))];
  while(levels.at(-1).length>1){const prev=levels.at(-1),next=[];for(let i=0;i<prev.length;i+=2)next.push(node(networkId,prev[i],prev[i+1]??prev[i]));levels.push(next);}
  return Object.freeze({root:root(networkId,saved.length,levels.at(-1)[0]),leafCount:saved.length,
    proof(index){
      if(!Number.isSafeInteger(index)||index<0||index>=saved.length)throw new TypeError('invalid index');
      const siblings=[];let position=index;
      for(const level of levels.slice(0,-1)){siblings.push(level[position^1]??level[position]);position=Math.floor(position/2);}
      return {version:MEMBERSHIP_VERSION,network_id:networkId,commitment:saved[index],leaf_index:index,leaf_count:saved.length,siblings};
    }});
}

export function verifyMembership512(input){
  try{
    const {networkId,anchorRoot,anchorLeafCount,commitment,membership}=input??{};
    network(networkId);digest(anchorRoot);count(anchorLeafCount);digest(commitment);
    if(!exact(membership,'commitment,leaf_count,leaf_index,network_id,siblings,version')||
      membership.version!==MEMBERSHIP_VERSION||membership.network_id!==networkId||membership.commitment!==commitment||
      membership.leaf_count!==anchorLeafCount||!Number.isSafeInteger(membership.leaf_index)||membership.leaf_index<0||membership.leaf_index>=anchorLeafCount||
      !Array.isArray(membership.siblings)||membership.siblings.length!==Math.ceil(Math.log2(anchorLeafCount)))return false;
    let value=leaf(networkId,commitment),position=membership.leaf_index,width=anchorLeafCount;
    for(const sibling of membership.siblings){
      digest(sibling);
      if(position%2===0){if(position+1>=width&&sibling!==value)return false;value=node(networkId,value,sibling);}
      else value=node(networkId,sibling,value);
      position=Math.floor(position/2);width=Math.ceil(width/2);
    }
    return root(networkId,anchorLeafCount,value)===anchorRoot;
  }catch{return false;}
}
