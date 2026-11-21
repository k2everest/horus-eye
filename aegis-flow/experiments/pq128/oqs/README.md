# Isolated liboqs interoperability laboratory

This optional adapter uses the real C API from [Open Quantum Safe liboqs](https://github.com/open-quantum-safe/liboqs), with only standardized **ML-DSA-87** signatures and **ML-KEM-1024** key encapsulation enabled. It does not replace the node's existing Node/OpenSSL cryptography, wallet format, accepted guest or consensus rules.

The source is pinned to liboqs **0.16.0**, commit `5a1a854b0dc9f2141bdc771c555ee60c37950183`. `tools.lock.json` records the archive URL and SHA-256. The builder verifies the archive before safe extraction, disables OpenSSL inside liboqs and builds a minimal static library. Its local manifest records the source and helper hashes; this is a trusted build inventory, not an independent source-to-binary attestation or a reproducible-binary guarantee.

```sh
python3 aegis-flow/experiments/pq128/oqs/build.py --preflight-only
python3 aegis-flow/experiments/pq128/oqs/build.py
node --test aegis-flow/experiments/pq128/oqs/backend.test.mjs
AEGIS_OQS_INTEGRATION=1 node --test aegis-flow/experiments/pq128/oqs/integration.test.mjs
```

Requirements: Linux, Python 3, CMake >=3.15, GCC >=7.1, Make, Node >=24.8 and at least 1 GiB free for the build. A failed preflight downloads nothing. Each build uses a fresh directory under `work/oqs`; previous build directories are preserved. The real integration suite fails when explicitly enabled without the genuine pinned helper. Unit-test helper fixtures do not establish interoperability.

The bridge verifies Node-generated signatures, produces ephemeral signatures that Node verifies, and encapsulates to Node-generated ML-KEM public keys for Node decapsulation. Tests cover the application's SHA-512 transcript framing, changed messages/signatures, wrong recipients and KEM implicit rejection. Public-key conversion accepts only the exact algorithm OID and canonical fixed-length SPKI encoding. There is no classical or experimental-algorithm fallback.

Private keys never leave the provider that generated them. KEM shared secrets cross anonymous subprocess pipes only; the helper rejects terminal/file output for this operation. Inputs, output and execution time are bounded, errors are generic, and secrets are absent from command arguments and public reports. The JavaScript shared-secret wrapper rejects JSON and redacts inspection; `dispose()` clears its owned Buffer, without promising erasure of runtime, OS or caller copies. Derive an application key with a context-bound KDF before use; this laboratory does not implement a network handshake or replay protection.

CI compiles the pinned C library and runs the genuine integration suite. Its published artifacts contain versions, sizes, hashes and test booleans only, with `aegis_target_met:false` and `production_ready:false`.

## What this establishes

Successful interoperability establishes that these two implementations agree on the selected standard signature and KEM encodings and operations in the tested cases. It does **not** prove their implementation security, the full Aegis protocol's PQ128 security, receipt knowledge soundness, privacy or Fiat–Shamir security in the QROM. liboqs does not provide an extractor for STARK/RISC Zero receipts. The project's own [limitations](https://github.com/open-quantum-safe/liboqs/tree/5a1a854b0dc9f2141bdc771c555ee60c37950183#limitations-and-security) describe liboqs as a research/prototyping library and advise against protecting sensitive production data with it. This integration remains an opt-in laboratory.
