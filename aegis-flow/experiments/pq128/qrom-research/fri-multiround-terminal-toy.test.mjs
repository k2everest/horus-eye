import test from 'node:test';
import assert from 'node:assert/strict';
import {foldToy} from './fri-terminal-toy.mjs';
import {classifyMultiRoundFriTerminal} from './fri-multiround-terminal-toy.mjs';
const p=17,D=Array.from({length:8},(_,i)=>{
 let x=1;for(let j=0;j<i;j++)x=x*9%p;return x;
});
const initial=D.map(x=>(x**4+x**5)%p);
test('two-fold exact-code terminal covering with adversarial successor',()=>{
 const first=foldToy({prime:p,domain:D,values:initial,beta:0});
 const fake=Array(4).fill(first.values[0]);
 const last=Array(2).fill(first.values[0]);
 const missed=classifyMultiRoundFriTerminal({prime:p,domain:D,
   words:[initial,fake,last],betas:[0,0],degreeBound:4,
   queryPositions:[0]});
 assert.equal(missed.initial_codeword,false);
 assert.equal(missed.accepted,true);
 assert.equal(missed.query_missed_committed_discrepancy,true);
 assert.equal(missed.exceptional_fold,false);
 assert.equal(missed.first_invalid_to_good_transition,0);
 const detected=classifyMultiRoundFriTerminal({prime:p,domain:D,
   words:[initial,fake,last],betas:[0,0],degreeBound:4,
   queryPositions:[1]});
 assert.equal(detected.accepted,false);
});
test('exhaustive beta and constant successor attacks across both folds',()=>{
 let n=0,accepted=0,missed=0,exceptional=0;
 for(let beta=0;beta<p;beta++)
   for(let value=0;value<p;value++)
     for(let q=0;q<D.length;q++){
       const r=classifyMultiRoundFriTerminal({prime:p,domain:D,
         words:[initial,Array(4).fill(value),Array(2).fill(value)],
         betas:[beta,0],degreeBound:4,queryPositions:[q]});
       assert.equal(r.accepting_invalid_implies_bad_event,true);
       assert.equal(r.pq128_demonstrated,false);
       n++;
       if(r.accepted){
         accepted++;
         if(r.exceptional_fold)exceptional++;
         if(r.query_missed_committed_discrepancy)missed++;
       }
     }
 assert.equal(n,2312);
 assert.ok(accepted>0);
 assert.ok(missed>0);
 assert.ok(exceptional>0);
});
test('fully consistent two-fold low-degree polynomial is accepted',()=>{
 const values=D.map(x=>(x*x+1)%p);
 const f1=foldToy({prime:p,domain:D,values,beta:7});
 const f2=foldToy({prime:p,domain:f1.domain,values:f1.values,beta:3});
 const r=classifyMultiRoundFriTerminal({prime:p,domain:D,
   words:[values,[...f1.values],[...f2.values]],betas:[7,3],
   degreeBound:4,queryPositions:[0,1,2,3,4,5,6,7]});
 assert.equal(r.initial_codeword,true);
 assert.equal(r.final_codeword,true);
 assert.equal(r.accepted,true);
 assert.equal(r.exceptional_fold,false);
 assert.equal(r.query_missed_committed_discrepancy,false);
});
test('reject nonhalving and malformed chains',()=>{
 assert.throws(()=>classifyMultiRoundFriTerminal({prime:p,domain:D,
   words:[initial,[0,0,0]],betas:[0],degreeBound:4,queryPositions:[0]}));
});
