// Finite-field demonstration of the fixed-oracle ALI/OOD terminal dichotomy.
// Does NOT prove actual Plonky3 PCS, FRI, LogUp, CMS, QROM or PQ128.
const reject=()=>{throw new TypeError('INVALID_FIXED_ORACLE_TOY_INSTANCE');};
const mod=(x,p)=>((x%p)+p)%p;
const pow=(x,n,p)=>{let a=mod(x,p),r=1;for(let i=0;i<n;i++)r=mod(r*a,p);return r;};
const evalPoly=(a,x,p)=>a.reduceRight((s,c)=>mod(s*x+c,p),0);
const coeff=(a,p)=>Array.isArray(a)&&a.length>0&&a.length<=64&&a.every(
  x=>Number.isSafeInteger(x)&&x>=0&&x<p);
export function classifyAliOodTerminal({prime,traceRows,constraints,alpha,zeta,quotient}={}){
  if(!Number.isSafeInteger(prime)||prime<5||prime>257||
    !Number.isSafeInteger(traceRows)||traceRows<2||traceRows>=prime||
    (prime-1)%traceRows!==0||!Number.isSafeInteger(alpha)||
    !Number.isSafeInteger(zeta)||alpha<0||alpha>=prime||zeta<0||zeta>=prime||
    !Array.isArray(constraints)||!constraints.length||constraints.length>16||
    !constraints.every(c=>coeff(c,prime))||!coeff(quotient,prime))reject();
  for(let d=2;d*d<=prime;d++)if(prime%d===0)reject();
  const H=[];for(let x=0;x<prime;x++)if(pow(x,traceRows,prime)===1)H.push(x);
  if(H.length!==traceRows)reject();
  const initialInvalid=H.some(x=>constraints.some(c=>evalPoly(c,x,prime)!==0));
  const folded=x=>constraints.reduce(
    (sum,c,j)=>mod(sum+pow(alpha,j,prime)*evalPoly(c,x,prime),prime),0);
  const cancelled=initialInvalid&&H.every(x=>folded(x)===0);
  const domainHit=H.includes(zeta);
  const D=mod(folded(zeta)-
    mod(pow(zeta,traceRows,prime)-1,prime)*evalPoly(quotient,zeta,prime),prime);
  const oodRoot=initialInvalid&&!cancelled&&!domainHit&&D===0;
  const acceptsAliOod=!domainHit&&D===0;
  const exceptional=cancelled||oodRoot;
  if(initialInvalid&&acceptsAliOod&&!exceptional)
    throw new Error('TERMINAL_COVERING_ALGEBRA_CONTRADICTION');
  return Object.freeze({
    schema:'AEGIS_ALI_OOD_TERMINAL_COVERING_FINITE_TOY_V1',
    original_trace_invalid:initialInvalid,
    folded_constraint_cancelled_on_H:cancelled,
    ood_discrepancy_is_root:oodRoot,
    zeta_inside_domain:domainHit,
    ali_ood_accepted:acceptsAliOod,
    invalid_acceptance_implies_exceptional:!initialInvalid||!acceptsAliOod||exceptional,
    complete_wired_terminal_covering_proved:false,
    pcs_fri_quantum_extraction_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
