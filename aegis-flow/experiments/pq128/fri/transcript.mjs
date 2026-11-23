// Experimental SHA-512 transcript. The labels/framing below are explicit but
// are NOT claimed equivalent to the CMS19 BCS compiler or its QROM theorem.
import {bindingDigest512} from '../bindings.mjs';
import {decodeUniformChallenge512} from '../challenge-sampling.mjs';

const u32 = n => {const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
function exactOptions(value,allowed) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(key=>!allowed.includes(key)))throw new TypeError('invalid transcript options');
}
function integer(n,min,max) {if(!Number.isSafeInteger(n)||n<min||n>max)throw new TypeError('invalid transcript parameter');}

export class Transcript {
  #state; #phase='commit'; #maxDraws; #commits=0; #fields=0; #queries=0; #calls=0; #rejections=0;
  constructor(options) {
    exactOptions(options,['context','maxDraws']);
    const {context,maxDraws=4}=options;
    if(!(context instanceof Uint8Array)||context.length<1||context.length>16384)throw new TypeError('bounded nonempty context required');
    integer(maxDraws,1,16);this.#maxDraws=maxDraws;
    // maxDraws is part of the context so different retry policies cannot share
    // an otherwise identical transcript. Every frame binds the fixed suite.
    this.#state=this.#hash('FRI_TRANSCRIPT_INIT',[Buffer.from(context),u32(maxDraws)]);
  }
  #hash(domain,parts) {
    const digest=Buffer.from(bindingDigest512({domain,parts}),'hex');this.#calls++;return digest;
  }
  #requirePhase(phase) {if(this.#phase!==phase)throw new Error('FRI_TRANSCRIPT_ORDER');}
  commit(root) {
    this.#requirePhase('commit');
    if(typeof root!=='string'||!/^[0-9a-f]{128}$/.test(root))throw new TypeError('canonical SHA-512 root required');
    if(this.#commits>=33)throw new Error('FRI_TRANSCRIPT_ROUND_LIMIT');
    this.#state=this.#hash('FRI_TRANSCRIPT_COMMIT',[this.#state,u32(this.#commits),Buffer.from(root,'hex')]);
    this.#commits++;this.#phase='challenge';
  }
  fieldChallenge() {
    this.#requirePhase('challenge');
    if(this.#fields>=32)throw new Error('FRI_TRANSCRIPT_ROUND_LIMIT');
    for(let draw=0;draw<this.#maxDraws;draw++) {
      const block=this.#hash('FRI_FIELD_DRAW',[this.#state,u32(this.#fields),u32(draw)]);
      const value=decodeUniformChallenge512(block);
      if(value!==null) {
        this.#state=this.#hash('FRI_FIELD_ACCEPT',[this.#state,u32(this.#fields),u32(draw),block]);
        this.#fields++;this.#phase='commit';return value;
      }
      this.#rejections++;
    }
    this.#phase='failed';throw new Error('FRI_CHALLENGE_REJECTION_LIMIT');
  }
  queryIndices(options) {
    this.#requirePhase('challenge');exactOptions(options,['size','count']);
    const {size,count}=options;integer(size,1,65536);integer(count,1,1024);
    if((size&(size-1))!==0)throw new TypeError('query size must be a power of two');
    const indices=[];
    // A uniform 16-bit word masked by size-1 is exactly uniform for the
    // admitted powers of two. Sampling is with replacement; do not deduplicate.
    for(let blockIndex=0;indices.length<count;blockIndex++) {
      const block=this.#hash('FRI_QUERY_DRAW',[this.#state,u32(this.#queries),u32(size),u32(count),u32(blockIndex)]);
      this.#state=block;
      for(let offset=0;offset<64&&indices.length<count;offset+=2)indices.push(block.readUInt16BE(offset)&(size-1));
    }
    this.#queries++;this.#phase='sealed';return indices;
  }
  stateDigest() {return this.#state.toString('hex');}
  get oracleCalls() {return this.#calls;}
  get counters() {return {oracleCalls:this.#calls,commits:this.#commits,fieldChallenges:this.#fields,
    queryChallenges:this.#queries,rejectedDraws:this.#rejections};}
}
