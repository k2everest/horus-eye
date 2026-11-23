import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAliOodTerminal} from './terminal-covering-ali.mjs';
test('exhaustively classifies every invalid ALI/OOD acceptance in F17',()=>{
  let acceptedInvalid=0,roots=0,cancellations=0;
  const polynomials=[[0],[1],[0,1],[1,1],[0,0,1],[16,0,0,1]];
  for(const c of polynomials)for(const q of polynomials)
    for(let alpha=0;alpha<17;alpha++)for(let zeta=0;zeta<17;zeta++){
      const r=classifyAliOodTerminal({prime:17,traceRows:4,
        constraints:[c,[0,1]],quotient:q,alpha,zeta});
      assert.equal(r.invalid_acceptance_implies_exceptional,true);
      assert.equal(r.complete_wired_terminal_covering_proved,false);
      if(r.original_trace_invalid&&r.ali_ood_accepted){
        acceptedInvalid++;
        assert.equal(r.folded_constraint_cancelled_on_H||
          r.ood_discrepancy_is_root,true);
        if(r.folded_constraint_cancelled_on_H)cancellations++;
        else roots++;
      }
    }
  assert.ok(acceptedInvalid>0);
  assert.ok(roots>0);
  assert.ok(cancellations>0);
});
test('rejects nonfields and invalid toy inputs',()=>{
  assert.throws(()=>classifyAliOodTerminal({prime:15,traceRows:2,
    constraints:[[1]],quotient:[1],alpha:0,zeta:0}));
  assert.throws(()=>classifyAliOodTerminal({prime:17,traceRows:4,
    constraints:[[1]],quotient:[1],alpha:17,zeta:0}));
});
