// Requested monetary denomination. These constants do not activate a genesis
// or change the existing block/subsidy/difficulty rules.
export const AEGIS_PER_QUEER = 105_000_000n;
export const MAX_QUEER = 20_000_000n;
export const MAX_AEGIS = MAX_QUEER * AEGIS_PER_QUEER;

function atomicValue(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value)) throw Error('INVALID_AEGIS_AMOUNT');
  const amount = BigInt(value);
  if (amount > MAX_AEGIS) throw Error('QUEER_AMOUNT_ABOVE_REQUESTED_CAP');
  return amount;
}

export function parseQueerAmount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,8})(?:\.[0-9]{1,18})?$/.test(value)) throw Error('INVALID_QUEER_AMOUNT');
  const [whole, fraction = ''] = value.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = (BigInt(whole) * denominator + BigInt(fraction || '0')) * AEGIS_PER_QUEER;
  if (numerator % denominator !== 0n) throw Error('FRACTIONAL_AEGIS_NOT_REPRESENTABLE');
  const atomic = (numerator / denominator).toString();
  atomicValue(atomic);
  return atomic;
}

export function queerAmountParts(value) {
  const amount = atomicValue(value);
  return {queer: (amount / AEGIS_PER_QUEER).toString(), aegis_remainder: (amount % AEGIS_PER_QUEER).toString()};
}

export function formatQueerAmountExact(value) {
  const parts = queerAmountParts(value);
  if (parts.aegis_remainder === '0') return `${parts.queer} QUEER`;
  if (parts.queer === '0') return `${parts.aegis_remainder} AEGIS`;
  return `${parts.queer} QUEER + ${parts.aegis_remainder} AEGIS`;
}
