// SHA-512 expressed entirely as Boolean arithmetic constraints. This is a
// gadget, not a proof system, a hiding protocol, or an end-to-end PQ128 claim.
// Word bits are little-endian internally; the public API uses byte/MSB order.
import {BitCircuit} from './bit-circuit.mjs';

// FIPS 180-4 section 4.2.3 and section 5.3.5. These integer constants are also
// cross-checked by the native SHA-512 test vectors; no host hash is called here.
const K=Object.freeze([
  '428a2f98d728ae22','7137449123ef65cd','b5c0fbcfec4d3b2f','e9b5dba58189dbbc',
  '3956c25bf348b538','59f111f1b605d019','923f82a4af194f9b','ab1c5ed5da6d8118',
  'd807aa98a3030242','12835b0145706fbe','243185be4ee4b28c','550c7dc3d5ffb4e2',
  '72be5d74f27b896f','80deb1fe3b1696b1','9bdc06a725c71235','c19bf174cf692694',
  'e49b69c19ef14ad2','efbe4786384f25e3','0fc19dc68b8cd5b5','240ca1cc77ac9c65',
  '2de92c6f592b0275','4a7484aa6ea6e483','5cb0a9dcbd41fbd4','76f988da831153b5',
  '983e5152ee66dfab','a831c66d2db43210','b00327c898fb213f','bf597fc7beef0ee4',
  'c6e00bf33da88fc2','d5a79147930aa725','06ca6351e003826f','142929670a0e6e70',
  '27b70a8546d22ffc','2e1b21385c26c926','4d2c6dfc5ac42aed','53380d139d95b3df',
  '650a73548baf63de','766a0abb3c77b2a8','81c2c92e47edaee6','92722c851482353b',
  'a2bfe8a14cf10364','a81a664bbc423001','c24b8b70d0f89791','c76c51a30654be30',
  'd192e819d6ef5218','d69906245565a910','f40e35855771202a','106aa07032bbd1b8',
  '19a4c116b8d2d0c8','1e376c085141ab53','2748774cdf8eeb99','34b0bcb5e19b48a8',
  '391c0cb3c5c95a63','4ed8aa4ae3418acb','5b9cca4f7763e373','682e6ff3d6b2b8a3',
  '748f82ee5defb2fc','78a5636f43172f60','84c87814a1f0ab72','8cc702081a6439ec',
  '90befffa23631e28','a4506cebde82bde9','bef9a3f7b2c67915','c67178f2e372532b',
  'ca273eceea26619c','d186b8c721c0c207','eada7dd6cde0eb1e','f57d4f7fee6ed178',
  '06f067aa72176fba','0a637dc5a2c898a6','113f9804bef90dae','1b710b35131c471b',
  '28db77f523047d84','32caab7b40c72493','3c9ebe0a15c9bebc','431d67c49c100d4c',
  '4cc5d4becb3e42b6','597f299cfc657e2a','5fcb6fab3ad6faec','6c44198c4a475817',
]);
const INITIAL=Object.freeze(['6a09e667f3bcc908','bb67ae8584caa73b','3c6ef372fe94f82b','a54ff53a5f1d36f1',
  '510e527fade682d1','9b05688c2b3e6c1f','1f83d9abfb41bd6b','5be0cd19137e2179']);
const rotate=(word,n)=>Array.from({length:64},(_,i)=>word[(i+n)%64]);
const shift=(word,n,zero)=>Array.from({length:64},(_,i)=>i+n<64?word[i+n]:zero);
const xorWord=(b,a,c)=>a.map((bit,i)=>b.xor(bit,c[i]));
const xor3=(b,a,c,d)=>xorWord(b,xorWord(b,a,c),d);

// Every carry and sum is constructed from Boolean gates. No machine-word or
// field-size wrap is used to stand in for an unconstrained addition relation.
function addWord(b,a,c){
  const out=new Array(64);let carry=b.zero;
  for(let i=0;i<64;i++){
    const different=b.xor(a[i],c[i]);out[i]=b.xor(different,carry);
    if(i<63)carry=b.xor(b.and(a[i],c[i]),b.and(different,carry));
  }
  return out; // The final carry is discarded as prescribed by addition mod 2^64.
}
const addWords=(b,...words)=>words.slice(1).reduce((sum,word)=>addWord(b,sum,word),words[0]);
const sigma0=(b,w)=>xor3(b,rotate(w,1),rotate(w,8),shift(w,7,b.zero));
const sigma1=(b,w)=>xor3(b,rotate(w,19),rotate(w,61),shift(w,6,b.zero));
const sum0=(b,w)=>xor3(b,rotate(w,28),rotate(w,34),rotate(w,39));
const sum1=(b,w)=>xor3(b,rotate(w,14),rotate(w,18),rotate(w,41));
const choose=(b,e,f,g)=>g.map((bit,i)=>b.xor(bit,b.and(e[i],b.xor(f[i],bit))));
const majority=(b,a,c,d)=>a.map((bit,i)=>b.xor(b.and(bit,c[i]),b.and(d[i],b.xor(bit,c[i]))));

export function sha512Bits(builder,messageBits){
  if(!(builder instanceof BitCircuit))throw new TypeError('BitCircuit builder required');
  if(!Array.isArray(messageBits)||messageBits.length%8!==0||messageBits.length>1024*8)throw new TypeError('SHA-512 requires 0..1024 byte-aligned message bytes');
  builder.assertWires(messageBits);
  const byteLength=messageBits.length/8;
  const paddedBytes=Math.ceil((byteLength+17)/128)*128;
  const tail=Buffer.alloc(paddedBytes-byteLength);tail[0]=0x80;
  tail.writeBigUInt64BE(BigInt(messageBits.length),tail.length-8);
  const padded=[...messageBits,...builder.constantBytes(tail)];
  const constantWord=hex=>Array.from(builder.constantBytes(Buffer.from(hex,'hex'))).reverse();
  const constants=K.map(constantWord);
  let state=INITIAL.map(constantWord);
  for(let block=0;block<padded.length;block+=1024){
    const schedule=Array.from({length:16},(_,i)=>padded.slice(block+i*64,block+(i+1)*64).reverse());
    for(let t=16;t<80;t++)schedule[t]=addWords(builder,sigma1(builder,schedule[t-2]),schedule[t-7],sigma0(builder,schedule[t-15]),schedule[t-16]);
    let [a,b,c,d,e,f,g,h]=state;
    for(let t=0;t<80;t++){
      const t1=addWords(builder,h,sum1(builder,e),choose(builder,e,f,g),constants[t],schedule[t]);
      const t2=addWord(builder,sum0(builder,a),majority(builder,a,b,c));
      [a,b,c,d,e,f,g,h]=[addWord(builder,t1,t2),a,b,c,addWord(builder,d,t1),e,f,g];
    }
    state=state.map((previous,i)=>addWord(builder,previous,[a,b,c,d,e,f,g,h][i]));
  }
  return Object.freeze(state.flatMap(word=>word.slice().reverse()));
}
