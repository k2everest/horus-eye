import test from 'node:test';
import assert from 'node:assert/strict';
import {FRI_SCHEMA,proveLowDegree,verifyLowDegree} from './protocol.mjs';
import {ZERO,ONE,fromBase,fft,encodeElement} from './field.mjs';
import {buildMerkle} from './merkle.mjs';
import {Transcript} from './transcript.mjs';
import {bindingFrame512} from '../bindings.mjs';
const context=Buffer.from('public-polynomial-fixture-not-a-financial-witness');
const clone=structuredClone;
const flip=s=>(s[0]==='0'?'1':'0')+s.slice(1);

test('real extension-field low-degree proofs roundtrip through JSON and verifier policy',()=>{
  for(const domainLog2 of [3,5,8]){
    const queries=32,n=2**domainLog2;
    const coefficients=Array.from({length:n/4},(_,i)=>[BigInt(i+1),BigInt(i+2),3n,4n,5n]);
    const options={context,domainLog2,queries};
    const result=proveLowDegree({...options,coefficients});
    assert.equal(verifyLowDegree({...options,root:result.root,proof:JSON.parse(JSON.stringify(result.proof))}),true);
    assert.equal(result.diagnostics.hiding,false);assert.equal(result.diagnostics.financial_proof,false);
    assert.equal(result.diagnostics.aegis_target_met,false);
    assert.equal(verifyLowDegree({...options,root:flip(result.root),proof:result.proof}),false);
    assert.equal(verifyLowDegree({...options,root:result.root,context:Buffer.from('another-network'),proof:result.proof}),false);
    assert.equal(verifyLowDegree({...options,root:result.root,queries:queries-1,proof:result.proof}),false);
    assert.equal(verifyLowDegree({...options,root:result.root,domainLog2:domainLog2+1,proof:result.proof}),false);
  }
});

test('720 replacement queries use compact shared openings and still check folding',()=>{
  const options={context,domainLog2:8,queries:720};
  const {root,proof}=proveLowDegree({...options,coefficients:[fromBase(9n),fromBase(2n)]});
  assert.equal(verifyLowDegree({...options,root,proof}),true);
  assert.ok(proof.layers[0].leaves.length<720*2);
  assert.ok(JSON.stringify(proof).length<100_000);
  const badFinal=clone(proof);badFinal.final_value=encodeElement(fromBase(1n)).toString('hex');
  assert.equal(verifyLowDegree({...options,root,proof:badFinal}),false);
});

test('adversarial roots, paths, encodings, schemas and cardinalities fail closed',()=>{
  const options={context,domainLog2:8,queries:32};
  const {root,proof}=proveLowDegree({...options,coefficients:[ONE,fromBase(2n)]});
  const mutations=[
    p=>p.roots[1]=flip(p.roots[1]),p=>p.roots.push(p.roots[0]),
    p=>p.layers.pop(),p=>p.layers[0].leaves.pop(),
    p=>p.layers[0].leaves[0].value=flip(p.layers[0].leaves[0].value),
    p=>p.layers[0].leaves[0].value='ff'.repeat(40),
    p=>p.layers[0].leaves[0].index=65535,p=>p.layers[0].extra=true,
    p=>p.aegis_target_met=true,p=>p.schema='RISC0-COMPOSITE-STARK-V1',
    p=>p.final_value=p.final_value.toUpperCase(),p=>p.layers[0].nodes.push({level:0,index:0,hash:root}),
  ];
  for(const mutate of mutations){const p=clone(proof);mutate(p);assert.equal(verifyLowDegree({...options,root,proof:p}),false);}
  assert.equal(verifyLowDegree({...options,root,proof:null}),false);
  for(const change of [{domainLog2:17},{queries:0},{queries:1025},{context:Buffer.alloc(8193)}]){
    assert.throws(()=>proveLowDegree({...options,...change,coefficients:[ONE]}));
    assert.equal(verifyLowDegree({...options,...change,root,proof}),false);
  }
  assert.throws(()=>proveLowDegree({...options,coefficients:Array.from({length:65},()=>ONE)}));
});

test('authentic Merkle openings of a high-degree oracle cannot bypass the final constant test',()=>{
  // f(X)=X^(N/4) is just OUTSIDE the claimed degree bound. Every binary
  // fold halves this even monomial, so the final polynomial is X, not zero.
  // All commitments/openings below are genuine; only the constant claim is false.
  const domainLog2=6,queries=32,n=2**domainLog2,rounds=domainLog2-2;
  const ints=Buffer.alloc(12);ints.writeUInt32BE(domainLog2);ints.writeUInt32BE(n/4,4);ints.writeUInt32BE(queries,8);
  const transcript=new Transcript({context:bindingFrame512({domain:'FRI_PARAMETERS',parts:[Buffer.from(FRI_SCHEMA),ints,context]})});
  const roots=[],trees=[];
  for(let round=0;round<rounds;round++){
    const size=n/2**round,coefficients=Array.from({length:size},()=>ZERO);coefficients[size/4]=ONE;
    const tree=buildMerkle(fft(coefficients).map(encodeElement));trees.push(tree);roots.push(tree.root);
    transcript.commit(tree.root);transcript.fieldChallenge();
  }
  const final=encodeElement(ZERO),last=buildMerkle(Array.from({length:4},()=>final));
  roots.push(last.root);transcript.commit(last.root);
  const indices=transcript.queryIndices({size:n,count:queries});
  const layers=trees.map((tree,r)=>{const half=n/2**(r+1);return tree.openMany(indices.flatMap(i=>[i%half,i%half+half]));});
  const proof={schema:FRI_SCHEMA,roots,final_value:final.toString('hex'),layers};
  assert.equal(verifyLowDegree({context,domainLog2,queries,root:roots[0],proof}),false);
});
