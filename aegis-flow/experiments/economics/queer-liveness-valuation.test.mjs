import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_AEGIS,MAX_QUEER} from '../../services/open-chain/queer-units.mjs';
import {forecastV3SupplyDifficulty,marketCapAccounting} from './queer-liveness-valuation.mjs';
test('V3 quadratic scarcity tightening causes 4x,100x,10000x target work at unchanged hashrate, before floor',()=>{
  for(const [fraction,mult] of [[2n,4n],[10n,100n],[100n,10000n]]){
    const issued=MAX_AEGIS*(fraction-1n)/fraction;
    const x=forecastV3SupplyDifficulty({issuedAtomic:issued});
    assert.equal(BigInt(x.expected_work_multiplier_at_fixed_hashrate.numerator)/
                 BigInt(x.expected_work_multiplier_at_fixed_hashrate.denominator),mult);
    assert.equal(x.consensus_floor_applied,false);
    assert.equal(x.supported_policy_change,false);
  }
  assert.throws(()=>forecastV3SupplyDifficulty({issuedAtomic:MAX_AEGIS}));
});
test('valuation algebra uses actual configured 20M QUEER and never predicts price',()=>{
  assert.equal(MAX_QUEER,20_000_000n);
  assert.equal(MAX_AEGIS,2_100_000_000_000_000n);
  assert.equal(marketCapAccounting({usdPerQueer:50n}).fully_diluted_valuation_usd,'1000000000');
  assert.equal(marketCapAccounting({usdPerQueer:500n}).fully_diluted_valuation_usd,'10000000000');
  assert.equal(marketCapAccounting({usdPerQueer:5000n}).fully_diluted_valuation_usd,'100000000000');
  assert.equal(marketCapAccounting({usdPerQueer:50n}).future_price_guarantee,false);
  assert.throws(()=>marketCapAccounting({usdPerQueer:50}));
});
