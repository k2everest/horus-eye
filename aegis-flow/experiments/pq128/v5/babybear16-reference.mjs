// Mathematical reference only: GF(2013265921)[x]/(x^16-31).
// NOT wired to Plonky3 PCS, not an audited quantum secure field.
import {randomBytes} from 'node:crypto';
const P=2013265921n,D=16,N=31n;
export const BB16={prime:P,degree:D,nonresidue:N,bytes:64};
const mod=x=>((x%P)+P)%P;
// The reference inverse needs fewer than 512 exponent bits. Bound every
// public exponent before shifting so negative values cannot loop forever.
const checkExponent=n=>{
 if(typeof n!=='bigint'||n<0n||n>=(1n<<512n))throw new RangeError('bounded nonnegative bigint exponent required');
 return n;
};
export function powBase(a,n){checkExponent(n);let x=mod(a),r=1n;while(n){if(n&1n)r=mod(r*x);x=mod(x*x);n>>=1n;}return r;}
export function irreducibilityCertificate(){
 const factors=[2n,3n,5n],order=P-1n;
 const residues=factors.map(f=>powBase(N,order/f));
 const primitive=(order===(2n**27n)*3n*5n)&&residues.every(x=>x!==1n);
 const criterion=primitive&&P%4n===1n&&order%2n===0n;
 return {polynomial:'x^16-31',prime:P.toString(),primitive_root:31,
  order_test_residues:residues.map(String),criterion_proved:criterion,
  field_bits:Math.log2(Number(P))*D,field_size:(P**16n).toString(),
  implemented_in_plonky3:false,pcs_compatible:false,pq128_demonstrated:false};
}
const check=a=>{
 if(!Array.isArray(a))throw new RangeError('noncanonical GF(p^16) coefficients');
 const length=a.length;
 if(length!==D)throw new RangeError('noncanonical GF(p^16) coefficients');
 const copy=Array(D);
 for(let i=0;i<length;i++){
  if(!Object.hasOwn(a,i))throw new RangeError('noncanonical GF(p^16) coefficients');
  const x=a[i];
  if(typeof x!=='bigint'||x<0n||x>=P)throw new RangeError('noncanonical GF(p^16) coefficients');
  copy[i]=x;
 }
 return copy;
};
export const one=()=>[1n,...Array(15).fill(0n)];
export const zero=()=>Array(16).fill(0n);
export function add(a,b){a=check(a);b=check(b);return a.map((x,i)=>mod(x+b[i]));}
export function sub(a,b){a=check(a);b=check(b);return a.map((x,i)=>mod(x-b[i]));}
export function mul(a,b){
 a=check(a);b=check(b);const r=Array(31).fill(0n);
 for(let i=0;i<16;i++)for(let j=0;j<16;j++)r[i+j]+=a[i]*b[j];
 for(let i=30;i>=16;i--)r[i-16]+=N*r[i];
 return r.slice(0,16).map(mod);
}
export function pow(a,n){
 a=check(a);checkExponent(n);
 let b=a,r=one();while(n){if(n&1n)r=mul(r,b);n>>=1n;if(n)b=mul(b,b);}
 return r;
}
export function inverse(a){a=check(a);if(a.every(x=>x===0n))throw new RangeError('division by zero');return pow(a,P**16n-2n);}
export function encode(a){
 a=check(a);const b=Buffer.alloc(64);a.forEach((x,i)=>b.writeUInt32LE(Number(x),i*4));return b;
}
export function decode(b){
 if(!Buffer.isBuffer(b)||b.length!==64)throw new TypeError('64 byte canonical encoding required');
 return check(Array.from({length:16},(_,i)=>BigInt(b.readUInt32LE(i*4))));
}
export function uniformSample(source=randomBytes){
 const result=[];let tries=0;
 while(result.length<16&&tries++<2048){
  const x=source(4);if(!Buffer.isBuffer(x)||x.length!==4)throw new TypeError('invalid OS entropy');
  const y=BigInt(x.readUInt32LE(0));if(y<P)result.push(y);
 }
 if(result.length!==16)throw new Error('entropy rejection bound reached');return result;
}
