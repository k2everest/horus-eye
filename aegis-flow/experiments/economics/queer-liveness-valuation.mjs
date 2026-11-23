// Diagnostic economic research, NOT active consensus or a price predictor.
// Uses the exact supply law in services/open-chain/consensus.mjs:
// target = pow_limit * (remaining/cap)^2, clipped by a fixed target floor.
// At unchanged aggregate hashrate, expected inter-block waiting time is
// inversely proportional to target. The target floor and miner responses
// may change the observed time; this is a pre-floor conditional analysis.
import {MAX_QUEER,MAX_AEGIS} from '../../services/open-chain/queer-units.mjs';

const rational = (numerator,denominator)=>Object.freeze({
  numerator:numerator.toString(),denominator:denominator.toString(),
});
export function forecastV3SupplyDifficulty({issuedAtomic,baselineSpacingSeconds=600}={}){
  if(typeof issuedAtomic!=='bigint'||issuedAtomic<0n||issuedAtomic>=MAX_AEGIS)
    throw new RangeError('issuedAtomic must be in [0, fixed capped supply)');
  if(!Number.isSafeInteger(baselineSpacingSeconds)||baselineSpacingSeconds<1||
     baselineSpacingSeconds>86400)throw new RangeError('invalid spacing');
  const remaining=MAX_AEGIS-issuedAtomic;
  const workMultiplier=rational(MAX_AEGIS*MAX_AEGIS,remaining*remaining);
  const targetRatio=rational(remaining*remaining,MAX_AEGIS*MAX_AEGIS);
  // Exact pre-floor expected interval numerator / denominator, seconds.
  const intervalSeconds=rational(
    BigInt(baselineSpacingSeconds)*MAX_AEGIS*MAX_AEGIS,
    remaining*remaining,
  );
  return Object.freeze({
    schema:'QUEER_V3_FIXED_HASHRATE_LIVENESS_DIAGNOSTIC_V1',
    issued_atomic:issuedAtomic.toString(),max_atomic:MAX_AEGIS.toString(),
    remaining_atomic:remaining.toString(),
    pre_floor_target_ratio:targetRatio,
    expected_work_multiplier_at_fixed_hashrate:workMultiplier,
    expected_block_interval_seconds_pre_floor:intervalSeconds,
    network_hashrate_assumed_constant:true,
    consensus_floor_applied:false,
    attack_and_miner_behavior_not_modelled:true,
    supported_policy_change:false,
    valuation_predicted:false,
  });
}
// Pure algebraic accounting; not a forecast of price or liquidity.
export function marketCapAccounting({usdPerQueer,issuedQueer=MAX_QUEER}={}){
  if(typeof usdPerQueer!=='bigint'||usdPerQueer<0n||
     typeof issuedQueer!=='bigint'||issuedQueer<0n||
     issuedQueer>MAX_QUEER)throw new TypeError('use nonnegative integer US dollars and valid QUEER circulating supply');
  const diluted=usdPerQueer*MAX_QUEER;
  return Object.freeze({
    schema:'QUEER_MARKET_CAP_ACCOUNTING_NOT_PRICE_FORECAST_V1',
    max_queer:MAX_QUEER.toString(),
    atomic_per_queer:(MAX_AEGIS/MAX_QUEER).toString(),
    assumed_usd_per_queer:usdPerQueer.toString(),
    circulating_queer_assumed:issuedQueer.toString(),
    current_market_cap_usd_under_assumptions:(issuedQueer*usdPerQueer).toString(),
    fully_diluted_valuation_usd:diluted.toString(),
    liquidity_or_demand_demonstrated:false,
    future_price_guarantee:false,
  });
}
