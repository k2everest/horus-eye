import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {reviewLaunch,signLaunchDecision,factsBaseline,APPROVAL_ROLES} from './review.mjs';
import {generateSigningKeyPair,exportPublicKey} from '../../libs/crypto-core/pqc-wrapper.mjs';
const draft=()=>JSON.parse(readFileSync(new URL('../../docs/launch/review.json',import.meta.url),'utf8'));
const syntheticReference='12'.repeat(32);
function completeFixture(){
 const dossier=draft();dossier.scope='economic-launch';
 dossier.candidate={source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),image_ref:'sha256:'+'34'.repeat(32),config_id:'56'.repeat(32),genesis_root:'78'.repeat(32)};
 dossier.operator={entity_reference_sha256:syntheticReference,jurisdictions:['BR'],legal_assessment_sha256:syntheticReference};
 for(const name of Object.keys(dossier.monetary_decisions))dossier.monetary_decisions[name]=syntheticReference;
 for(const name of Object.keys(dossier.evidence))dossier.evidence[name]=syntheticReference;
 for(const role of Object.keys(dossier.operating_roles))dossier.operating_roles[role]={responsible_id:`${role}-owner`,deputy_id:`${role}-deputy`,appointment_sha256:syntheticReference,coverage_sha256:syntheticReference};
 const now=1000000;const keys=APPROVAL_ROLES.map(()=>generateSigningKeyPair());
 const registry=APPROVAL_ROLES.map((role,index)=>({signer_id:`reviewer-${role}`,role,public_key:exportPublicKey(keys[index].publicKey),mandate_sha256:syntheticReference,qualification_review_sha256:syntheticReference}));
 const approvals=APPROVAL_ROLES.map((role,index)=>signLaunchDecision({dossier,signerId:registry[index].signer_id,role,signedAt:now-1000,expiresAt:now+86400000,privateKey:keys[index].privateKey}));
 return{dossier,registry,approvals,keys,now};
}
test('draft reports actual monetary limits and cannot assert a ready release',()=>{
 const report=reviewLaunch({dossier:draft()});
 assert.equal(report.checks.monetary_source_baseline,true);assert.equal(report.checks.documents_bound,true);
 assert.equal(report.monetary_facts.max_note_value,'9007199254740991');assert.equal(report.monetary_facts.explicit_max_supply_registry,false);
 assert.equal(report.monetary_facts.public_amount_payout_implemented,false);assert.equal(report.unassigned_roles.length,9);
 assert.equal(report.release_authorized,false);assert.equal(report.legal_clearance_asserted,false);
});
test('even five genuine role signatures and complete-looking references do not prove legal/technical readiness',()=>{
 const fixture=completeFixture();const report=reviewLaunch(fixture);
 assert.equal(report.dossier_controls_complete,true);assert.equal(report.approved_roles.length,5);
 assert.equal(report.external_evidence_validation_required,true);assert.equal(report.release_authorized,false);assert.equal(report.production_ready,false);
 assert.ok(report.known_technical_blockers.some(s=>s.includes('128-bit')));
});
test('approvals bind the exact dossier; expiration, rejection and role substitution fail closed',()=>{
 const f=completeFixture();
 const modified=structuredClone(f.dossier);modified.monetary_decisions.public_amount_policy_sha256='ab'.repeat(32);
 assert.equal(reviewLaunch({...f,dossier:modified}).checks.role_approvals,false);
 assert.equal(reviewLaunch({...f,now:f.now+2*86400000}).checks.role_approvals,false);
 const substituted=structuredClone(f.approvals);substituted[0].role='legal';assert.equal(reviewLaunch({...f,approvals:substituted}).checks.role_approvals,false);
 const rejected=[...f.approvals];const index=APPROVAL_ROLES.indexOf('legal');
 rejected[index]=signLaunchDecision({dossier:f.dossier,signerId:f.registry[index].signer_id,role:'legal',decision:'reject',signedAt:f.now-1000,expiresAt:f.now+86400000,privateKey:f.keys[index].privateKey});
 const report=reviewLaunch({...f,approvals:rejected});assert.deepEqual(report.rejected_roles,['legal']);assert.equal(report.checks.role_approvals,false);
});
test('declarative supply flags, missing Git objects and duplicated approval keys cannot establish readiness',()=>{
 const f=completeFixture();const baseline=structuredClone(factsBaseline);baseline.facts.explicit_max_supply_registry=true;
 assert.equal(reviewLaunch({...f,baseline}).checks.monetary_source_baseline,false);
 const candidate=structuredClone(f.dossier);candidate.candidate.source_commit='ff'.repeat(20);
 assert.equal(reviewLaunch({...f,dossier:candidate}).checks.monetary_source_baseline,false);
 const registry=structuredClone(f.registry);registry[1].public_key=registry[0].public_key;
 assert.throws(()=>reviewLaunch({...f,registry}),/KEYS_MUST_BE_DISTINCT/);
});
test('CLI inspect is diagnostic and release gate rejects the draft',()=>{
 const cli=new URL('../../scripts/launch-review.mjs',import.meta.url).pathname;
 const inspected=spawnSync(process.execPath,[cli,'inspect'],{encoding:'utf8'});assert.equal(inspected.status,0);assert.equal(JSON.parse(inspected.stdout).release_authorized,false);
 const gated=spawnSync(process.execPath,[cli,'gate'],{encoding:'utf8'});assert.equal(gated.status,1);assert.equal(JSON.parse(gated.stdout).production_ready,false);
});
