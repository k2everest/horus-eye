// RESEARCH-ONLY capacity gate for the complete 1-in / 1-out six-SHA512
// circuit. This is a resource heuristic, NOT a peak-RSS upper bound or a
// cryptographic security claim. Never touches a private financial witness.
import {readFileSync} from 'node:fs';
import {publicSixSha512Capacity} from './financial-capacity-preflight.mjs';

// Measured native peak of the successfully completed ONE-SHA512 experiment
// recorded on 2026-11-28; program identity pinned by the public profile.
// It includes 524,288 trace rows and a 20,803,644-KiB peak RSS.
export const ONE_SHA512_MEASURED=Object.freeze({
  program_sha512:'fd563ac13c33f6ce73525092b78aae29abf7c26a1df3e013b79ae974d77abae40febb2c2259d5635b1485c6c7141875b93d309d01ff6743f17b51af910066861',
  rows:524288,
  peak_rss_kib:20803644,
  wall_clock_seconds:70.75,
  native_exit_code:0,
});
// 50% research headroom over a linearly scaled measured baseline. This
// does not account rigorously for nonlinear prover allocations.
const HEADROOM=1.5;
const KIB_PER_GIB=1048576;

export function assessSixSha512Memory({
  geometry, availableMemoryKiB=null, effectiveLimitKiB=null,
}={}){
  if(!geometry||geometry.sha512_hash_calls!==6||
     !Number.isSafeInteger(geometry.trace_rows)||
     geometry.trace_rows<ONE_SHA512_MEASURED.rows||
     !Number.isSafeInteger(geometry.gate_count)||
     geometry.gate_count<1000000)
    throw new TypeError('COMPLETE_SIX_SHA512_PUBLIC_GEOMETRY_REQUIRED');
  for(const value of [availableMemoryKiB,effectiveLimitKiB])
    if(value!==null&&(!Number.isSafeInteger(value)||value<0))
      throw new TypeError('CANONICAL_HOST_MEMORY_KIB_REQUIRED');
  const rowMultiplier=geometry.trace_rows/ONE_SHA512_MEASURED.rows;
  const linearProjectionKiB=Math.ceil(ONE_SHA512_MEASURED.peak_rss_kib*rowMultiplier);
  const screeningThresholdKiB=Math.ceil(linearProjectionKiB*HEADROOM);
  const effectiveAvailableKiB=availableMemoryKiB===null?null:
    effectiveLimitKiB===null?availableMemoryKiB:
      Math.min(availableMemoryKiB,effectiveLimitKiB);
  return Object.freeze({
    schema:'AEGIS_SIX_SHA512_MEMORY_SCREEN_V1',
    sha512_hash_calls:geometry.sha512_hash_calls,
    financial_gate_count:geometry.gate_count,
    financial_trace_rows:geometry.trace_rows,
    measured_one_sha512_rows:ONE_SHA512_MEASURED.rows,
    measured_one_sha512_peak_rss_kib:ONE_SHA512_MEASURED.peak_rss_kib,
    measured_one_sha512_program_sha512:ONE_SHA512_MEASURED.program_sha512,
    trace_row_ratio:rowMultiplier,
    projected_linear_kib:linearProjectionKiB,
    engineering_headroom_factor:HEADROOM,
    screening_threshold_kib:screeningThresholdKiB,
    screening_threshold_gib:Math.ceil(screeningThresholdKiB/KIB_PER_GIB),
    available_memory_kib:effectiveAvailableKiB,
    sufficient_host_memory_screen:effectiveAvailableKiB===null?false:
      effectiveAvailableKiB>=screeningThresholdKiB,
    projection_is_rigorous_upper_bound:false,
    prove_or_verify_executed:false,
    financial_relation_proved:false,
    pq128_demonstrated:false,
    production_ready:false,
  });
}

export function readLinuxAvailableMemoryKiB(){
  const text=readFileSync('/proc/meminfo','utf8');
  const value=text.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1];
  const available=Number(value);
  if(!value||!Number.isSafeInteger(available)||available<=0)
    throw new Error('LINUX_AVAILABLE_MEMORY_UNAVAILABLE');
  // Effective cgroup remaining allocation, where available; unlimited
  // cgroups and absent cgroup v1/v2 files leave host MemAvailable unchanged.
  let cgroupRemaining=null;
  const groups=[
    ['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory.current'],
    ['/sys/fs/cgroup/memory/memory.limit_in_bytes',
      '/sys/fs/cgroup/memory/memory.usage_in_bytes'],
  ];
  for(const [maxFile,usedFile] of groups){
    try{
      const max=readFileSync(maxFile,'utf8').trim();
      if(!/^\d+$/.test(max))continue;
      const limit=BigInt(max);
      // Kernel uses very large numbers to encode "unlimited".
      if(limit>=BigInt(Number.MAX_SAFE_INTEGER))continue;
      const used=BigInt(readFileSync(usedFile,'utf8').trim());
      const remaining=limit>used?limit-used:0n;
      const kib=Number(remaining/1024n);
      cgroupRemaining=cgroupRemaining===null?kib:Math.min(cgroupRemaining,kib);
    }catch{continue;}
  }
  return Object.freeze({availableMemoryKiB:available,
    effectiveLimitKiB:cgroupRemaining});
}

if(process.argv[1]?.endsWith('/financial-memory-gate.mjs')){
  const geometry=publicSixSha512Capacity();
  const host=readLinuxAvailableMemoryKiB();
  const result=assessSixSha512Memory({geometry,...host});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(process.argv.includes('--require-capacity')&&!result.sufficient_host_memory_screen)
    process.exitCode=78;
}
