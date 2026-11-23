// Exact-code, one-fold FRI terminal covering over a small prime field.
// Research tool ONLY; not an implementation of Plonky3's real verifier.
const fail=()=>{throw new TypeError('INVALID_FRI_TERMINAL_TOY');};
const mod=(a,p)=>((a%p)+p)%p;
const prime=p=>Number.isSafeInteger(p)&&p>=5&&p<=257&&
  Array.from({length:Math.floor(Math.sqrt(p))-1},(_,i)=>i+2)
    .every(d=>p%d!==0);
const pow=(a,n,p)=>{
  let r=1,b=mod(a,p),k=n;
  while(k>0){if(k%2===1)r=mod(r*b,p);b=mod(b*b,p);k=Math.floor(k/2);}
  return r;
};
const inv=(a,p)=>{if(mod(a,p)===0)fail();return pow(a,p-2,p);};
const shape=(p,domain,values)=>{
  if(!prime(p)||!Array.isArray(domain)||!Array.isArray(values)||
    domain.length<2||domain.length>16||domain.length!==values.length||
    !domain.every(x=>Number.isSafeInteger(x)&&x>0&&x<p)||
    new Set(domain).size!==domain.length||
    !values.every(x=>Number.isSafeInteger(x)&&x>=0&&x<p))fail();
};
const mulLinear=(a,x,p)=>{
  const out=Array(a.length+1).fill(0);
  a.forEach((v,i)=>{out[i]=mod(out[i]-x*v,p);
    out[i+1]=mod(out[i+1]+v,p);});
  return out;
};
export function interpolateToy(primeField,domain,values){
  shape(primeField,domain,values);
  const p=primeField,out=Array(domain.length).fill(0);
  for(let i=0;i<domain.length;i++){
    let basis=[1],denom=1;
    for(let j=0;j<domain.length;j++)if(i!==j){
      basis=mulLinear(basis,domain[j],p);
      denom=mod(denom*(domain[i]-domain[j]),p);
    }
    const weight=mod(values[i]*inv(denom,p),p);
    basis.forEach((v,j)=>{out[j]=mod(out[j]+weight*v,p);});
  }
  while(out.length>1&&out.at(-1)===0)out.pop();
  return Object.freeze(out);
}
export function isToyLowDegree(p,domain,values,bound){
  if(!Number.isSafeInteger(bound)||bound<1||bound>domain.length)fail();
  return interpolateToy(p,domain,values).length<=bound;
}
export function foldToy({prime: p,domain,values,beta}){
  shape(p,domain,values);
  if(domain.length%2||!Number.isSafeInteger(beta)||beta<0||beta>=p)fail();
  const positions=new Map(domain.map((x,i)=>[x,i]));
  const seen=new Set(),outputDomain=[],outputValues=[];
  for(const x of domain){
    const key=mod(x*x,p);
    if(seen.has(key))continue;
    const opposite=mod(-x,p),j=positions.get(opposite);
    if(j===undefined)fail();
    const a=values[positions.get(x)],b=values[j];
    const even=mod((a+b)*inv(2,p),p);
    const odd=mod((a-b)*inv(mod(2*x,p),p),p);
    outputDomain.push(key);
    outputValues.push(mod(even+beta*odd,p));
    seen.add(key);
  }
  if(outputDomain.length!==domain.length/2)fail();
  return Object.freeze({domain:Object.freeze(outputDomain),
    values:Object.freeze(outputValues)});
}
export function classifyFriTerminalToy({prime:p,domain,values,beta,
  nextValues,degreeBound,queries}){
  shape(p,domain,values);
  if(!Number.isSafeInteger(degreeBound)||degreeBound<2||
    degreeBound>domain.length||degreeBound%2!==0||
    !Array.isArray(nextValues)||nextValues.length!==domain.length/2||
    !nextValues.every(x=>Number.isSafeInteger(x)&&x>=0&&x<p)||
    !Array.isArray(queries)||!queries.length||
    !queries.every(i=>Number.isSafeInteger(i)&&i>=0&&i<nextValues.length))fail();
  const folded=foldToy({prime:p,domain,values,beta});
  const initialLow=isToyLowDegree(p,domain,values,degreeBound);
  const trueFoldLow=isToyLowDegree(p,folded.domain,folded.values,
    degreeBound/2);
  const nextLow=isToyLowDegree(p,folded.domain,nextValues,degreeBound/2);
  const mismatch=nextValues.flatMap((x,i)=>
    x===folded.values[i]?[]:[i]);
  const missed=queries.every(j=>!mismatch.includes(j));
  const accepted=nextLow&&missed;
  const badFold=!initialLow&&trueFoldLow;
  const badQuery=!initialLow&&!trueFoldLow&&mismatch.length>0&&missed;
  if(accepted&&!initialLow&&!badFold&&!badQuery)
    throw new Error('FRI_TERMINAL_DICHOTOMY_VIOLATED');
  return Object.freeze({
    schema:'AEGIS_EXACT_CODE_SINGLE_FOLD_TERMINAL_TOY_V1',
    initial_is_low_degree:initialLow,
    true_fold_is_low_degree:trueFoldLow,
    next_is_low_degree:nextLow,
    bad_fold:badFold,bad_query_miss:badQuery,
    bad_position_count:mismatch.length,
    accepted,
    accepting_invalid_implies_bad_event:!accepted||initialLow||badFold||badQuery,
    pointwise_one_fold_only:true,
    full_plonky3_terminal_covering_proved:false,
    quantum_extraction_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
