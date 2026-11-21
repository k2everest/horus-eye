// Experimental arithmetic only. No financial AIR, STARK acceptance or PQ128
// security claim is supplied by this field implementation.
export const P = (1n << 64n) - (1n << 32n) + 1n;
export const W = 3n;
const DEGREE = 5;
const MAX_FFT_LOG = 16;
const GENERATOR = 7n;
const EXTENSION_ORDER = P ** 5n;
const freeze = values => Object.freeze(values);
export const ZERO = freeze([0n, 0n, 0n, 0n, 0n]);
export const ONE = freeze([1n, 0n, 0n, 0n, 0n]);
const mod = value => { const result = value % P; return result < 0n ? result + P : result; };
function integer(value) {
  if (typeof value !== 'bigint') throw new TypeError('bigint field value required');
  return value;
}
function basePow(value, exponent) {
  let result = 1n, base = mod(value), n = exponent;
  while (n > 0n) {
    if (n & 1n) result = result * base % P;
    base = base * base % P;
    n >>= 1n;
  }
  return result;
}

// For prime degree 5 dividing p-1, X^5-W is irreducible over F_p iff W is
// not a fifth power. The even-degree binomial exception does not apply.
if ((P - 1n) % 5n !== 0n || basePow(W, (P - 1n) / 5n) === 1n) {
  throw new Error('reducible experimental field polynomial');
}

export function assertElement(element) {
  if (!Array.isArray(element) || element.length !== DEGREE) throw new TypeError('five field limbs required');
  for (const limb of element) {
    if (typeof limb !== 'bigint' || limb < 0n || limb >= P) throw new TypeError('canonical field limb required');
  }
  return element;
}
export function fromBase(value) {
  return freeze([mod(integer(value)), 0n, 0n, 0n, 0n]);
}
export function equal(a, b) {
  assertElement(a); assertElement(b);
  return a.every((value, i) => value === b[i]);
}
export function add(a, b) {
  assertElement(a); assertElement(b);
  return freeze(a.map((value, i) => (value + b[i]) % P));
}
export function sub(a, b) {
  assertElement(a); assertElement(b);
  return freeze(a.map((value, i) => mod(value - b[i])));
}
export function scale(a, scalar) {
  assertElement(a); const factor = mod(integer(scalar));
  return freeze(a.map(value => value * factor % P));
}
export function mul(a, b) {
  assertElement(a); assertElement(b);
  const product = Array(2 * DEGREE - 1).fill(0n);
  for (let i = 0; i < DEGREE; i++) for (let j = 0; j < DEGREE; j++) product[i + j] += a[i] * b[j];
  for (let i = product.length - 1; i >= DEGREE; i--) product[i - DEGREE] += W * product[i];
  return freeze(product.slice(0, DEGREE).map(mod));
}
export function pow(a, exponent) {
  assertElement(a); integer(exponent);
  if (exponent < 0n) throw new RangeError('nonnegative exponent required');
  let result = fromBase(1n), base = freeze([...a]), n = exponent;
  while (n > 0n) {
    if (n & 1n) result = mul(result, base);
    base = mul(base, base);
    n >>= 1n;
  }
  return result;
}
export function inv(a) {
  assertElement(a);
  if (a.every(limb => limb === 0n)) throw new RangeError('zero has no inverse');
  return pow(a, EXTENSION_ORDER - 2n);
}
export function encodeElement(element) {
  assertElement(element);
  const encoded = Buffer.alloc(40);
  for (let i = 0; i < DEGREE; i++) encoded.writeBigUInt64BE(element[i], 8 * i);
  return encoded;
}
export function decodeElement(encoded) {
  if (!Buffer.isBuffer(encoded) || encoded.length !== 40) throw new TypeError('exactly 40 encoded bytes required');
  const element = Array.from({length: DEGREE}, (_, i) => encoded.readBigUInt64BE(8 * i));
  assertElement(element);
  return freeze(element);
}
export function rootOfUnity(logN) {
  if (!Number.isInteger(logN) || logN < 0 || logN > 32) throw new RangeError('root log size must be in 0..32');
  const order = 1n << BigInt(logN);
  const root = basePow(GENERATOR, (P - 1n) / order);
  if (basePow(root, order) !== 1n || (logN > 0 && basePow(root, order / 2n) === 1n)) {
    throw new Error('incorrect root order');
  }
  return root;
}

// Subgroup FFT over F_p embedded in F_(p^5). Inverse includes division by n.
// Public experimental resource bound: n <= 2^16. No coset shift is implicit.
export function fft(values, inverse = false) {
  if (typeof inverse !== 'boolean') throw new TypeError('boolean inverse flag required');
  if (!Array.isArray(values) || values.length < 1 || values.length > 2 ** MAX_FFT_LOG ||
      (values.length & (values.length - 1)) !== 0) throw new RangeError('bounded power-of-two FFT length required');
  const n = values.length;
  const result = Array.from(values, value => freeze([...assertElement(value)]));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [result[i], result[j]] = [result[j], result[i]];
  }
  for (let width = 2; width <= n; width *= 2) {
    let step = rootOfUnity(Math.log2(width));
    if (inverse) step = basePow(step, P - 2n);
    for (let offset = 0; offset < n; offset += width) {
      let twiddle = 1n;
      for (let j = 0; j < width / 2; j++) {
        const even = result[offset + j];
        const odd = scale(result[offset + j + width / 2], twiddle);
        result[offset + j] = add(even, odd);
        result[offset + j + width / 2] = sub(even, odd);
        twiddle = twiddle * step % P;
      }
    }
  }
  if (inverse) {
    const factor = basePow(BigInt(n), P - 2n);
    for (let i = 0; i < n; i++) result[i] = scale(result[i], factor);
  }
  return freeze(result);
}
export function evalPolynomial(coefficients, point) {
  assertElement(point);
  if (!Array.isArray(coefficients) || coefficients.length > 2 ** MAX_FFT_LOG) throw new RangeError('bounded coefficient array required');
  let value = fromBase(0n);
  for (let i = coefficients.length - 1; i >= 0; i--) value = add(mul(value, point), coefficients[i]);
  return value;
}
