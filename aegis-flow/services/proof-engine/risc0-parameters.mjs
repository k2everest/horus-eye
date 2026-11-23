// Narrow readers for the reviewed, pinned source forms below. This is not a
// Rust/TOML interpreter, a binary attestation or a quantum-security analysis.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENGINE=fileURLToPath(new URL('./',import.meta.url));
const DEFAULT_PROFILE=JSON.parse(readFileSync(join(ENGINE,'security-profile.json'),'utf8'));
const bad=()=>{throw new Error('unrecognized or ambiguous pinned source syntax');};
const one=(text,pattern)=>{const matches=[...text.matchAll(pattern)];if(matches.length!==1)bad();return matches[0];};
function decimal(text){if(!/^(0|[1-9][0-9]*)$/.test(text))bad();const n=Number(text);if(!Number.isSafeInteger(n))bad();return n;}
function rawStringEnd(text,index){
  if(index>0&&/[A-Za-z0-9_]/.test(text[index-1]))return null;
  const prefix=text.slice(index).match(/^(?:br|r)(#*)"/);if(!prefix)return null;
  if(prefix[1].length>16)bad();
  const closing='"'+prefix[1],end=text.indexOf(closing,index+prefix[0].length);
  if(end<0)bad();return end+closing.length;
}
function maskRustStrings(text){
  let out='',i=0;
  while(i<text.length){
    const end=rawStringEnd(text,i);
    if(end!==null){out+=text.slice(i,end).replace(/[^\r\n]/g,' ');i=end;continue;}
    if(text[i]==='"'){
      const start=i++;let closed=false;
      while(i<text.length){const c=text[i++];if(c==='\\'){if(i>=text.length)bad();i++;}else if(c==='"'){closed=true;break;}}
      if(!closed)bad();out+=text.slice(start,i).replace(/[^\r\n]/g,' ');continue;
    }
    // Distinguish character literals from lifetimes such as 'a and 'static.
    if(text[i]==="'"){
      const ch=text.slice(i).match(/^'(?:\\(?:u\{[0-9a-fA-F_]+\}|[^\r\n])|[^'\\\r\n])'/u);
      if(ch){out+=' '.repeat(ch[0].length);i+=ch[0].length;continue;}
    }
    out+=text[i++];
  }
  return out;
}

// Preserve strings while removing nested Rust comments or JS comments. No code
// is evaluated; quoted literals used by a reader still have to match its exact
// reviewed form. Unterminated strings/comments fail closed.
function uncomment(text,js=false){
  let out='',i=0;
  while(i<text.length){
    const c=text[i],next=text[i+1];
    if(!js){const end=rawStringEnd(text,i);if(end!==null){out+=text.slice(i,end);i=end;continue;}}
    if(c==='/'&&next==='/'){while(i<text.length&&text[i]!=='\n')i++;continue;}
    if(c==='/'&&next==='*'){
      i+=2;let depth=1;
      while(i<text.length&&depth){
        if(text[i]==='/'&&text[i+1]==='*'){depth++;i+=2;}
        else if(text[i]==='*'&&text[i+1]==='/'){depth--;i+=2;}
        else {if(text[i]==='\n')out+='\n';i++;}
      }
      if(depth)bad();out+=' ';continue;
    }
    if(c==='"'||(js&&(c==="'"||c==='`'))){
      const quote=c;out+=c;i++;let closed=false;
      while(i<text.length){const value=text[i++];out+=value;if(value==='\\'){if(i>=text.length)bad();out+=text[i++];}
        else if(value===quote){closed=true;break;}}
      if(!closed)bad();continue;
    }
    out+=c;i++;
  }
  return out;
}
function declaration(text,name,type){
  // Module-level constants only: associated EXT_SIZE aliases in impl blocks
  // are not independent definitions of the global field extension size.
  text=maskRustStrings(text);
  if(new RegExp('\\bconst\\s+r#'+name+'\\s*:').test(text))bad();
  const all=[...text.matchAll(new RegExp('\\bconst[ \\t]+'+name+'[ \\t]*:','g'))].length;
  const aliases=name==='EXT_SIZE'?[...text.matchAll(/^[ \t]+const\s+EXT_SIZE\s*:\s*usize\s*=\s*EXT_SIZE\s*;/gm)].length:0;
  if(all!==1+aliases||aliases>1)bad();
  one(text,new RegExp('^(?:pub(?:\\([^)]*\\))?[ \\t]+)?const[ \\t]+'+name+'[ \\t]*:','gm'));
  return one(text,new RegExp('^(?:pub(?:\\([^)]*\\))?[ \\t]+)?const[ \\t]+'+name+'[ \\t]*:[ \\t]*'+type+'[ \\t]*=[ \\t]*([^;\\r\\n]+);','gm'))[1].trim();
}
const numeric=(text,name,type='usize')=>decimal(declaration(text,name,type));
function lockVersions(text){
  const versions=new Map();
  for(const block of text.split(/^\[\[package\]\][ \t]*$/m).slice(1)){
    const names=[...block.matchAll(/^name[ \t]*=[ \t]*"([^"\r\n]+)"[ \t]*$/gm)];
    if(names.length!==1)bad();const name=names[0][1];
    if(!['risc0-zkvm','risc0-zkp','risc0-circuit-rv32im','risc0-core'].includes(name))continue;
    const version=one(block,/^version[ \t]*=[ \t]*"([0-9]+\.[0-9]+\.[0-9]+)"[ \t]*$/gm)[1];
    if(versions.has(name))bad();versions.set(name,version);
  }
  return versions;
}
function pinnedSdkDependency(text){
  const line=one(text,/^risc0-zkvm[ \t]*=[ \t]*\{([^}\r\n]*)\}[ \t]*$/gm)[1];
  const m=one(line,/^\s*version\s*=\s*"=([0-9]+\.[0-9]+\.[0-9]+)"\s*,\s*default-features\s*=\s*(false)\s*,\s*features\s*=\s*\[([^\]]*)\]\s*$/g);
  const featureText=m[3].trim(),features=featureText?featureText.split(',').map(v=>one(v,/^\s*"([a-z0-9-]+)"\s*$/g)[1]):[];
  if(new Set(features).size!==features.length||features.some(f=>!['std','disable-dev-mode'].includes(f)))bad();
  return {version:m[1],disableDevMode:features.includes('disable-dev-mode'),std:features.includes('std')};
}
function verifierPolicy(text){
  one(text,/match\s+&receipt\.inner\s*\{/g);
  const m=one(text,/match\s+&receipt\.inner\s*\{\s*InnerReceipt::([A-Za-z]+)\(composite\)\s+if\s+composite\.assumption_receipts\.is_empty\(\)\s*&&\s*!composite\.segments\.is_empty\(\)\s*&&\s*composite\.segments\.len\(\)\s*<=\s*([0-9]+)\s*&&\s*composite\.segments\.iter\(\)\.all\(\|segment\|\s*segment\.hashfn\s*==\s*"([^"\r\n]+)"\)\s*=>\s*\{\s*\}\s*,?\s*_\s*=>\s*return\s+Err\("approved composite STARK receipt required"\.into\(\)\)\s*,\s*\}/g);
  if(maskRustStrings(text).slice(m.index,m.index+5)!=='match')bad();
  return {receipt:m[1].toLowerCase(),segments:decimal(m[2]),hash:m[3],emptyAssumptions:true,nonemptySegments:true};
}
function maskJsLiterals(text){
  let out='',i=0;
  while(i<text.length){
    if(text[i]!=="'"&&text[i]!=='"'&&text[i]!=='`'){out+=text[i++];continue;}
    const start=i,quote=text[i++];let closed=false;
    while(i<text.length){const c=text[i++];if(c==='\\'){if(i>=text.length)bad();i++;}else if(c===quote){closed=true;break;}}
    if(!closed)bad();out+=text.slice(start,i).replace(/[^\r\n]/g,' ');
  }
  return out;
}
function cliFlag(text,flag){
  // Only the reviewed direct r0vm argument array supplies these observations.
  // An unused string containing identical flag text is not an invocation.
  const call=one(text,/await\s+this\.#execute\(this\.#r0vm,\s*\[([^\]]*)\]\s*\)/g);
  if(maskJsLiterals(text).slice(call.index,call.index+5)!=='await')bad();
  text=call[1];
  const token=new RegExp('([\'\"])'+flag+'\\1','g');one(text,token);
  return one(text,new RegExp('([\'\"])'+flag+'\\1\\s*,\\s*([\'\"])([^\'\"\\r\\n]+)\\2','g'))[3];
}
function arrayField(text,name){
  text=maskRustStrings(text);
  const body=one(text,new RegExp('\\b'+name+'\\s*:\\s*&\\[([^\\]]*)\\]','g'))[1];
  const tokens=body.trim().replace(/,\s*$/,'').split(',').map(v=>v.trim());
  if(!tokens.length||tokens.some(t=>!t))bad();return tokens.map(decimal);
}
function dimensions(text,tapImplementation){
  // This is the exact reviewed group_size rule, not a width guessed from a
  // maximum back-distance. Different implementations need a new reader.
  one(maskRustStrings(tapImplementation),/pub\s+fn\s+group_size\(&self,\s*group_id:\s*usize\)\s*->\s*usize\s*\{\s*let\s+idx\s*=\s*self\.group_begin\[group_id\s*\+\s*1\]\s*-\s*1;\s*let\s+last\s*=\s*self\.taps\[idx\]\.offset\s+as\s*usize;\s*last\s*\+\s*1\s*\}/g);
  one(text,/group_names\s*:\s*&\[\s*"accum"\s*,\s*"code"\s*,\s*"data"\s*\]/g);
  text=maskRustStrings(text);
  const body=one(text,/\btaps\s*:\s*&\[([\s\S]*?)\]\s*,\s*combo_taps\s*:/g)[1];
  const entries=[...body.matchAll(/TapData\s*\{([^{}]*)\}/g)];
  if(!entries.length||body.replace(/TapData\s*\{[^{}]*\}\s*,?/g,'').trim())bad();
  const taps=entries.map(entry=>{
    const m=one(entry[1],/^\s*offset:\s*([0-9]+),\s*back:\s*([0-9]+),\s*group:\s*([0-9]+),\s*combo:\s*([0-9]+),\s*skip:\s*([0-9]+),\s*$/g);
    return {offset:decimal(m[1]),group:decimal(m[3])};
  });
  const groups=arrayField(text,'group_begin'),combos=arrayField(text,'combo_begin'),comboTaps=arrayField(text,'combo_taps');
  if(groups.length!==4||groups[0]!==0||groups.at(-1)!==taps.length||combos[0]!==0||combos.at(-1)!==comboTaps.length)bad();
  const widths=[];
  for(let group=0;group<3;group++){
    if(groups[group]>=groups[group+1])bad();
    const selected=taps.slice(groups[group],groups[group+1]);
    if(selected.some(t=>t.group!==group)||selected.at(-1).offset!==Math.max(...selected.map(t=>t.offset)))bad();
    widths.push(selected.at(-1).offset+1);
  }
  const lengths=combos.slice(1).map((v,i)=>v-combos[i]);if(lengths.some(v=>v<1))bad();
  const regCount=decimal(one(text,/\breg_count\s*:\s*([0-9]+)\s*,/g)[1]);
  const comboCount=decimal(one(text,/\bcombos_count\s*:\s*([0-9]+)\s*,/g)[1]);
  if(regCount!==widths.reduce((a,b)=>a+b,0)||comboCount!==lengths.length)bad();
  return {group_widths:widths,trace_polynomials:regCount,accumulator_columns:widths[0],biggest_combo:Math.max(...lengths)};
}

export function inspectRisc0Parameters({sourceRoot,profile=DEFAULT_PROFILE}={}){
  const checks=[],cache=new Map(),p=profile?.parameters??{};
  const read=(root,name,js=false)=>{
    const key=root+'\0'+name+'\0'+js;if(cache.has(key))return cache.get(key);
    const text=readFileSync(join(root,name),'utf8');if(text.length>4*1024*1024)bad();
    const value=name.endsWith('.rs')||js?uncomment(text,js):text;cache.set(key,value);return value;
  };
  const add=(parameter,expected,source,observe,{upstream=false}={})=>{
    expected=typeof expected==='string'||typeof expected==='boolean'||Number.isSafeInteger(expected)?expected:null;
    let observed=null,status='not-checked';
    if(!upstream||sourceRoot){
      try{observed=observe();if(observed===undefined||observed===null)bad();status=Object.is(expected,observed)?'match':'mismatch';}
      catch(error){status=error?.code==='ENOENT'||error?.code==='EACCES'?'unavailable':'unrecognized';}
    }
    checks.push({parameter,expected,observed,source,status});return status==='match'?observed:null;
  };
  const lock='verifier/Cargo.lock';let versions;
  try{versions=lockVersions(read(ENGINE,lock));}catch{versions=new Map();}
  for(const [key,crate] of [['sdk','risc0-zkvm'],['zkp','risc0-zkp'],['circuit','risc0-circuit-rv32im'],['core','risc0-core']])
    add(key,p[key],lock,()=>{if(!versions.has(crate))bad();return versions.get(crate);});
  const dep=()=>pinnedSdkDependency(read(ENGINE,'verifier/Cargo.toml'));
  add('sdk_dependency',p.sdk,'verifier/Cargo.toml',()=>dep().version);
  add('disable_dev_mode',true,'verifier/Cargo.toml',()=>dep().disableDevMode);
  add('verifier_std',true,'verifier/Cargo.toml',()=>dep().std);
  const policy=()=>verifierPolicy(read(ENGINE,'verifier/src/main.rs'));
  for(const [key,field] of [['receipt_kind','receipt'],['max_segments','segments'],['hash','hash']])
    add(key,p[key],'verifier/src/main.rs',()=>policy()[field]);
  add('no_assumptions',true,'verifier/src/main.rs',()=>policy().emptyAssumptions);
  add('nonempty_segments',true,'verifier/src/main.rs',()=>policy().nonemptySegments);
  add('prover_segment_po2',p.prover_segment_po2,'backend.mjs',()=>decimal(cliFlag(read(ENGINE,'backend.mjs',true),'--po2')));
  add('prover_hash',p.hash,'backend.mjs',()=>cliFlag(read(ENGINE,'backend.mjs',true),'--hashfn'));
  add('prover_receipt_kind',p.receipt_kind,'backend.mjs',()=>cliFlag(read(ENGINE,'backend.mjs',true),'--receipt-kind'));

  // Paths follow the versions observed in Cargo.lock, not edited profile labels.
  const file=(crate,path)=>{const version=versions.get(crate);if(!version)bad();return `${crate}-${version}/${path}`;};
  const upstream=(key,crate,path,observe)=>{
    let name;try{name=file(crate,path);}catch{name=`${crate}-UNRESOLVED/${path}`;}
    return add(key,p[key],name,()=>observe(read(sourceRoot,name)),{upstream:true});
  };
  for(const [key,name] of [['fri_queries','QUERIES'],['inverse_rate','INV_RATE'],['fri_min_degree','FRI_MIN_DEGREE']])
    upstream(key,'risc0-zkp','src/lib.rs',text=>numeric(text,name));
  upstream('fri_fold','risc0-zkp','src/lib.rs',text=>{
    if(!/^1\s*<<\s*FRI_FOLD_PO2$/.test(declaration(text,'FRI_FOLD','usize')))bad();
    const po2=numeric(text,'FRI_FOLD_PO2');if(po2>30)bad();return 2**po2;
  });
  upstream('sdk_max_segment_po2','risc0-zkp','src/lib.rs',text=>numeric(text,'MAX_CYCLES_PO2'));
  let verifyPath;try{verifyPath=file('risc0-zkp','src/verify/mod.rs');}catch{verifyPath='UNRESOLVED/src/verify/mod.rs';}
  add('sdk_po2_bound_enforced',true,verifyPath,()=>{
    const text=read(sourceRoot,verifyPath);
    one(text,/if\s+po2\s+as\s+usize\s*>\s*MAX_CYCLES_PO2\s*\{\s*tracing::error!\([^;]*\);\s*return\s+Err\(VerificationError::ReceiptFormatError\);\s*\}/g);return true;
  },{upstream:true});
  upstream('field_prime','risc0-core','src/field/baby_bear.rs',text=>{
    const expr=declaration(text,'P','u32'),m=one(expr,/^([0-9]+)\s*\*\s*\(1\s*<<\s*([0-9]+)\)\s*\+\s*([0-9]+)$/g);
    const a=decimal(m[1]),shift=decimal(m[2]),c=decimal(m[3]);if(shift>31)bad();
    const value=BigInt(a)*(1n<<BigInt(shift))+BigInt(c);if(value>0xffffffffn)bad();return Number(value);
  });
  upstream('extension_degree','risc0-core','src/field/baby_bear.rs',text=>numeric(text,'EXT_SIZE'));
  for(const [key,name,path,factor] of [['poseidon_width','CELLS','consts.rs',1],['poseidon_full_rounds','ROUNDS_HALF_FULL','consts.rs',2],
    ['poseidon_partial_rounds','ROUNDS_PARTIAL','consts.rs',1],['poseidon_rate','CELLS_RATE','mod.rs',1],['poseidon_output_elements','CELLS_OUT','mod.rs',1]])
    upstream(key,'risc0-zkp','src/core/hash/poseidon2/'+path,text=>numeric(text,name)*factor);
  upstream('constraint_degree','risc0-zkp','src/prove/soundness.rs',text=>decimal(one(maskRustStrings(text),/\blet\s+max_degree\s*=\s*([0-9]+)\.0\s*;/g)[1]));
  let circuitDimensions=null,tapsPath;
  try{tapsPath=file('risc0-circuit-rv32im','src/zirgen/taps.rs');}catch{tapsPath='UNRESOLVED/src/zirgen/taps.rs';}
  const dims=()=>{
    if(!circuitDimensions)circuitDimensions=dimensions(read(sourceRoot,tapsPath),read(sourceRoot,file('risc0-zkp','src/taps.rs')));
    return circuitDimensions;
  };
  for(const key of ['accumulator_columns','trace_polynomials','biggest_combo'])add(key,p[key],tapsPath,()=>dims()[key],{upstream:true});
  return {schema:'AEGIS_RISC0_PARAMETERS_V1',source_checked:Boolean(sourceRoot),parameters_match:checks.every(c=>c.status==='match'),
    checks,circuit_dimensions:circuitDimensions,quantum_security_demonstrated:false,production_ready:false};
}
