import test from 'node:test';
import assert from 'node:assert/strict';
import {foldToy,isToyLowDegree,classifyFriTerminalToy} from './fri-terminal-toy.mjs';
const P=17,D=Array.from({length:8},(_,i)=>{
  let r=1;for(let j=0;j<i;j++)r=r*9%P;return r;
});
const f=D.map(x=>(x**4+x**5)%P);
test('exact-code fold lemma: at most one exceptional beta for fixed non-codeword',()=>{
  assert.equal(isToyLowDegree(P,D,f,4),false);
  const exceptions=[];
  for(let beta=0;beta<P;beta++){
    const g=foldToy({prime:P,domain:D,values:f,beta});
    if(isToyLowDegree(P,g.domain,g.values,2))exceptions.push(beta);
  }
  assert.deepEqual(exceptions,[16]);
});
test('malicious successor codeword: accepted queries imply a query-miss event',()=>{
  // At beta=0 the true fold has degree 2, whereas the declared bound is <2.
  const beta=0,g=foldToy({prime:P,domain:D,values:f,beta});
  assert.equal(isToyLowDegree(P,g.domain,g.values,2),false);
  const fake=Array(4).fill(g.values[0]); // valid constant successor, false elsewhere
  const good=classifyFriTerminalToy({prime:P,domain:D,values:f,beta,
    nextValues:fake,degreeBound:4,queries:[0]});
  assert.equal(good.accepted,true);
  assert.equal(good.bad_fold,false);
  assert.equal(good.bad_query_miss,true);
  assert.equal(good.full_plonky3_terminal_covering_proved,false);
  const caught=classifyFriTerminalToy({prime:P,domain:D,values:f,beta,
    nextValues:fake,degreeBound:4,queries:[1]});
  assert.equal(caught.accepted,false);
});
test('exceptional fold is classified even with consistent authenticated openings',()=>{
  const beta=16,g=foldToy({prime:P,domain:D,values:f,beta});
  const r=classifyFriTerminalToy({prime:P,domain:D,values:f,beta,
    nextValues:[...g.values],degreeBound:4,queries:[0,1,2,3]});
  assert.equal(r.accepted,true);
  assert.equal(r.bad_fold,true);
  assert.equal(r.bad_query_miss,false);
});
test('exhaust all beta and terminal query positions with several malicious successors',()=>{
  const candidates=Array.from({length:P},(_,k)=>Array(4).fill(k));
  // Include all affine successor codewords a+b*y.
  const D2=foldToy({prime:P,domain:D,values:f,beta:0}).domain;
  for(let a=0;a<P;a++)for(let b=0;b<P;b++)
    candidates.push(D2.map(x=>(a+b*x)%P));
  let exceptionalAccept=0,missedAccept=0;
  for(let beta=0;beta<P;beta++)
    for(const nextValues of candidates)
      for(let q=0;q<4;q++){
        const r=classifyFriTerminalToy({prime:P,domain:D,values:f,
          beta,nextValues,degreeBound:4,queries:[q]});
        assert.equal(r.accepting_invalid_implies_bad_event,true);
        if(r.accepted&&r.bad_fold)exceptionalAccept++;
        if(r.accepted&&r.bad_query_miss)missedAccept++;
      }
  assert.ok(exceptionalAccept>0);
  assert.ok(missedAccept>0);
});
test('reject forged dimensions and malformed challenges',()=>{
  assert.throws(()=>foldToy({prime:P,domain:D,values:f,beta:17}));
  assert.throws(()=>classifyFriTerminalToy({prime:P,domain:D,
    values:f,beta:0,nextValues:[0],degreeBound:4,queries:[0]}));
});
