import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectRisc0Parameters} from './risc0-parameters.mjs';
const profile=JSON.parse(readFileSync(new URL('./security-profile.json',import.meta.url),'utf8'));
const fixtureProfile=()=>({...structuredClone(profile),parameters:{...profile.parameters,trace_polynomials:315,biggest_combo:6}});
const REGISTRY=fileURLToPath(new URL('../../../work/cargo/registry/src/index.crates.io-1949cf8c6b5b557f',import.meta.url));
const files={
  'risc0-zkp-3.0.6/src/lib.rs':`pub const MAX_CYCLES_PO2: usize = 24;
pub const QUERIES: usize = 50;
pub const INV_RATE: usize = 4;
const FRI_FOLD_PO2: usize = 4;
pub const FRI_FOLD: usize = 1 << FRI_FOLD_PO2;
const FRI_MIN_DEGREE: usize = 256;\n`,
  'risc0-zkp-3.0.6/src/verify/mod.rs':`if po2 as usize > MAX_CYCLES_PO2 {
tracing::error!("bad po2"); return Err(VerificationError::ReceiptFormatError);
}\n`,
  'risc0-core-3.0.2/src/field/baby_bear.rs':`pub const P: u32 = 15 * (1 << 27) + 1;
const EXT_SIZE: usize = 4;
impl SomeTrait for ExtElem {\n    const EXT_SIZE: usize = EXT_SIZE;\n}\n`,
  'risc0-zkp-3.0.6/src/core/hash/poseidon2/consts.rs':`pub const CELLS: usize = 24;
pub const ROUNDS_HALF_FULL: usize = 4;
pub const ROUNDS_PARTIAL: usize = 21;\n`,
  'risc0-zkp-3.0.6/src/core/hash/poseidon2/mod.rs':`pub const CELLS_RATE: usize = 16;
pub const CELLS_OUT: usize = 8;\n`,
  'risc0-zkp-3.0.6/src/prove/soundness.rs':'fn parameters() { let max_degree = 5.0; }\n',
  'risc0-zkp-3.0.6/src/taps.rs':`pub fn group_size(&self, group_id: usize) -> usize {
let idx = self.group_begin[group_id + 1] - 1;
let last = self.taps[idx].offset as usize;
last + 1
}\n`,
  // A small TapSet fixture exercises the actual group_size definition (last
  // offset + 1) and combo lengths, not a count of tap entries or maximum back.
  'risc0-circuit-rv32im-4.1.0/src/zirgen/taps.rs':`pub const TAPSET: &TapSet = &TapSet::<'static> {
taps: &[
TapData { offset: 102, back: 999, group: 0, combo: 0, skip: 1, },
TapData { offset: 0, back: 0, group: 1, combo: 0, skip: 1, },
TapData { offset: 210, back: 68, group: 2, combo: 0, skip: 1, },
], combo_taps: &[0,0,1,0,1,2,3,4,68,0,1,2,7,15,16,0,2,7,15,16],
combo_begin: &[0,1,3,9,15,20], group_begin: &[0,1,2,3],
combos_count: 5, reg_count: 315, group_names: &["accum", "code", "data"],
};\n`,
};
function fixtures(run){
  const root=mkdtempSync(join(tmpdir(),'aegis-risc0-params-'));
  try{for(const [name,value] of Object.entries(files)){const path=join(root,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value);}return run(root);}
  finally{rmSync(root,{recursive:true,force:true});}
}
const by=(report,parameter)=>report.checks.find(c=>c.parameter===parameter);
async function repositoryFixture(run){
  const root=mkdtempSync(join(tmpdir(),'aegis-risc0-repository-')),engine=join(root,'engine'),sourceRoot=join(root,'sources');
  try{
    for(const name of ['risc0-parameters.mjs','verifier/Cargo.lock','verifier/Cargo.toml','verifier/src/main.rs','backend.mjs']){
      const path=join(engine,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,readFileSync(new URL('./'+name,import.meta.url)));
    }
    writeFileSync(join(engine,'security-profile.json'),JSON.stringify(fixtureProfile()));
    for(const [name,value] of Object.entries(files)){const path=join(sourceRoot,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value);}
    const {inspectRisc0Parameters:inspect}=await import(pathToFileURL(join(engine,'risc0-parameters.mjs')).href);
    return await run({engine,sourceRoot,inspect});
  }finally{rmSync(root,{recursive:true,force:true});}
}

test('small source fixtures extract actual constants and TapSet dimensions with local policy checked',()=>fixtures(sourceRoot=>{
  const r=inspectRisc0Parameters({sourceRoot,profile:fixtureProfile()});
  assert.equal(r.parameters_match,true);assert.equal(r.source_checked,true);
  assert.deepEqual(r.circuit_dimensions,{group_widths:[103,1,211],trace_polynomials:315,accumulator_columns:103,biggest_combo:6});
  assert.equal(by(r,'field_prime').observed,2013265921);
  assert.equal(by(r,'extension_degree').observed,4);assert.equal(by(r,'fri_fold').observed,16);
  assert.equal(by(r,'poseidon_full_rounds').observed,8);
  assert.equal(by(r,'receipt_kind').observed,'composite');assert.equal(by(r,'hash').observed,'poseidon2');
  assert.equal(by(r,'max_segments').observed,64);assert.equal(by(r,'prover_segment_po2').observed,18);
  assert.equal(r.quantum_security_demonstrated,false);assert.equal(r.production_ready,false);
}));

test('editing profile labels cannot invent observed parameters even with unchanged source inventories',()=>fixtures(sourceRoot=>{
  const original=fixtureProfile(),p=structuredClone(original);p.parameters.fri_queries=128;p.parameters.extension_degree=8;
  p.parameters.max_segments=1;p.parameters.prover_segment_po2=24;p.parameters.trace_polynomials=316;p.parameters.biggest_combo=68;
  const inventory=createHash('sha256').update(JSON.stringify(p.upstream_source_sha256)).digest('hex');
  assert.deepEqual(p.upstream_source_sha256,original.upstream_source_sha256);
  const r=inspectRisc0Parameters({sourceRoot,profile:p});assert.equal(r.parameters_match,false);
  for(const [parameter,observed] of [['fri_queries',50],['extension_degree',4],['max_segments',64],['prover_segment_po2',18],['trace_polynomials',315],['biggest_combo',6]]){
    assert.equal(by(r,parameter).status,'mismatch');assert.equal(by(r,parameter).observed,observed);
  }
  assert.equal(inventory,createHash('sha256').update(JSON.stringify(p.upstream_source_sha256)).digest('hex'));
  p.parameters.zkp='99.0.0';const version=inspectRisc0Parameters({sourceRoot,profile:p});
  assert.equal(by(version,'zkp').observed,'3.0.6');assert.equal(by(version,'fri_queries').source,'risc0-zkp-3.0.6/src/lib.rs');
}));

test('missing root never invents upstream observations, while repository versions and policies remain visible',()=>{
  const r=inspectRisc0Parameters({profile:fixtureProfile()});
  assert.equal(r.source_checked,false);assert.equal(r.parameters_match,false);
  for(const key of ['fri_queries','field_prime','constraint_degree','accumulator_columns'])assert.deepEqual([by(r,key).observed,by(r,key).status],[null,'not-checked']);
  assert.equal(by(r,'sdk').observed,'3.1.0');assert.equal(by(r,'prover_segment_po2').observed,18);
  fixtures(sourceRoot=>{
    rmSync(join(sourceRoot,'risc0-zkp-3.0.6/src/lib.rs'));
    const absent=inspectRisc0Parameters({sourceRoot,profile:fixtureProfile()});assert.equal(absent.parameters_match,false);
    assert.equal(by(absent,'fri_queries').observed,null);assert.equal(by(absent,'fri_queries').status,'unavailable');
  });
});

test('damaged, duplicated, commented or unrecognized parameter definitions fail closed',()=>{
  for(const change of [
    s=>s+'pub const QUERIES: usize = 128;\n',s=>s+'  const QUERIES: usize = 128;\n',
    s=>s.replace('QUERIES: usize = 50','QUERIES: u32 = 50'),
    s=>s.replace('QUERIES: usize = 50','QUERIES: usize = 25 * 2'),
    s=>s.replace('pub const QUERIES: usize = 50;','/* pub const QUERIES: usize = 50; */'),
    s=>s.replace('pub const QUERIES: usize = 50;','pub const QUERIES: usize = unknown();'),
  ])fixtures(sourceRoot=>{
    const path=join(sourceRoot,'risc0-zkp-3.0.6/src/lib.rs');writeFileSync(path,change(readFileSync(path,'utf8')));
    const r=inspectRisc0Parameters({sourceRoot,profile:fixtureProfile()});assert.equal(r.parameters_match,false);
    assert.equal(by(r,'fri_queries').observed,null);assert.equal(by(r,'fri_queries').status,'unrecognized');
  });
  fixtures(sourceRoot=>{
    const path=join(sourceRoot,'risc0-core-3.0.2/src/field/baby_bear.rs');writeFileSync(path,'pub const P: u32 = eval("2013265921");\nconst EXT_SIZE: usize = 4;\n');
    const r=inspectRisc0Parameters({sourceRoot,profile:fixtureProfile()});assert.equal(r.parameters_match,false);assert.equal(by(r,'field_prime').observed,null);
  });
  fixtures(sourceRoot=>{
    const path=join(sourceRoot,'risc0-circuit-rv32im-4.1.0/src/zirgen/taps.rs');writeFileSync(path,readFileSync(path,'utf8').replace('group_begin: &[0,1,2,3]','group_begin: &[0,1,2,4]'));
    const r=inspectRisc0Parameters({sourceRoot,profile:fixtureProfile()});assert.equal(r.parameters_match,false);assert.equal(r.circuit_dimensions,null);
  });
});

test('installed pinned registry sources agree with the declared configuration',{skip:!existsSync(join(REGISTRY,'risc0-zkp-3.0.6/src/lib.rs'))},()=>{
  const r=inspectRisc0Parameters({sourceRoot:REGISTRY,profile:fixtureProfile()});
  assert.equal(r.parameters_match,true,JSON.stringify(r.checks.filter(c=>c.status!=='match')));
  assert.equal(r.circuit_dimensions.biggest_combo,6);assert.equal(r.circuit_dimensions.trace_polynomials,315);
});

test('string contents and raw identifiers cannot masquerade as executable constants',()=>{
  const declaration='pub const QUERIES: usize = 50;';
  const attempts=[
    'pub const r#QUERIES: usize = 128;\nconst TXT: &str = "\npub const QUERIES: usize = 50;\n";',
    'pub const r#QUERIES: usize = 128;\nconst TXT: &str = r###"\npub const QUERIES: usize = 50;\n"###;',
    'const TXT: &str = "\npub const QUERIES: usize = 50;\n";',
    'const TXT: &str = r#"\npub const QUERIES: usize = 50; // not executable\n"#;',
    'const TXT: &str = r#################"\"\npub const QUERIES: usize = 50;\n\""#################;',
  ];
  for(const replacement of attempts)fixtures(sourceRoot=>{
    const path=join(sourceRoot,'risc0-zkp-3.0.6/src/lib.rs');writeFileSync(path,readFileSync(path,'utf8').replace(declaration,replacement));
    const r=inspectRisc0Parameters({sourceRoot,profile:fixtureProfile()});
    assert.equal(r.parameters_match,false);assert.equal(by(r,'fri_queries').observed,null);assert.equal(by(r,'fri_queries').status,'unrecognized');
  });
  fixtures(sourceRoot=>{
    const path=join(sourceRoot,'risc0-zkp-3.0.6/src/lib.rs');
    writeFileSync(path,readFileSync(path,'utf8')+'\nconst TXT: &str = r###"\"literal quote\"\npub const QUERIES: usize = 128; /* inert */\n"###;\n');
    const r=inspectRisc0Parameters({sourceRoot,profile:fixtureProfile()});assert.equal(r.parameters_match,true);assert.equal(by(r,'fri_queries').observed,50);
  });
});

test('verifier policy and prover arguments cannot be supplied by inert string literals',async()=>{
  await repositoryFixture(({engine,sourceRoot,inspect})=>{
    const path=join(engine,'verifier/src/main.rs'),source=readFileSync(path,'utf8');
    const start=source.indexOf('match &receipt.inner {'),end=source.indexOf('    receipt.verify(',start);
    assert.ok(start>=0&&end>start);
    const policy=source.slice(start,end);
    writeFileSync(path,source.slice(0,start)+'let _unused = r###"'+policy+'"###;\n'+source.slice(end));
    const report=inspect({sourceRoot});
    assert.equal(report.parameters_match,false);assert.equal(by(report,'receipt_kind').observed,null);assert.equal(by(report,'receipt_kind').status,'unrecognized');
  });
  await repositoryFixture(({engine,sourceRoot,inspect})=>{
    const path=join(engine,'backend.mjs'),source=readFileSync(path,'utf8');
    const start=source.indexOf('await this.#execute(this.#r0vm, ['),end=source.indexOf(']);',start)+3;
    assert.ok(start>=0&&end>start);
    const invocation=source.slice(start,end);
    writeFileSync(path,source.slice(0,start)+'const unused = `'+invocation+'`;\n'+source.slice(end));
    const report=inspect({sourceRoot});assert.equal(report.parameters_match,false);
    for(const parameter of ['prover_segment_po2','prover_hash','prover_receipt_kind'])assert.equal(by(report,parameter).observed,null);
  });
  await repositoryFixture(({engine,sourceRoot,inspect})=>{
    const path=join(engine,'backend.mjs'),source=readFileSync(path,'utf8');
    writeFileSync(path,source+`\nconst unused = "'--po2', '99'";\n`);
    const report=inspect({sourceRoot});assert.equal(report.parameters_match,true);assert.equal(by(report,'prover_segment_po2').observed,18);
    const call=source.match(/await\s+this\.#execute\(this\.#r0vm,\s*\[[^\]]*\]\s*\)/g)[0];
    writeFileSync(path,source+'\n'+call+';\n');
    assert.equal(by(inspect({sourceRoot}),'prover_segment_po2').status,'unrecognized');
    writeFileSync(path,source.replace("'--po2', '18'","'--po2', '18', '--po2', '19'"));
    assert.equal(by(inspect({sourceRoot}),'prover_segment_po2').status,'unrecognized');
  });
});
