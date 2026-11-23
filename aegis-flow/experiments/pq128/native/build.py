#!/usr/bin/env python3
"""Build the isolated financial512 experiment using already installed tools.

No downloads, legacy manifest edits, or deletion of existing build artifacts.
The unchanged RISC Zero SDK does NOT demonstrate the PQ128 target.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

NATIVE = Path(__file__).resolve().parent
ROOT = NATIVE.parents[3]
WORK = ROOT / 'work'
ENGINE = ROOT / 'aegis-flow/services/proof-engine'
GUEST = NATIVE / 'guest'
TARGET = 'riscv32im-risc0-zkvm-elf'
PACKAGE = 'aegis-financial512-guest'
HOST_BIN = 'native512-check'
SOURCES = ['guest/Cargo.toml', 'guest/Cargo.lock', 'guest/src/lib.rs',
           'guest/src/main.rs', 'guest/src/bin/check.rs', 'build.py']


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def source_sha():
    h = hashlib.sha256()
    for name in SOURCES:
        h.update(name.encode('utf8') + b'\0')
        h.update((NATIVE / name).read_bytes())
    return h.hexdigest()


def executable(path, label):
    if not path.is_file() or not os.access(path, os.X_OK):
        raise RuntimeError(f'{label} unavailable: install pinned tools first; this script never downloads them')
    return path


def cargo_path():
    local = WORK / 'cargo/bin/cargo'
    if local.is_file() and (WORK / 'rustup/settings.toml').is_file():
        return executable(local, 'cargo')
    selected = shutil.which('cargo')
    if not selected:
        raise RuntimeError('cargo unavailable: install a host Rust toolchain first')
    return executable(Path(selected), 'cargo')


def environment():
    env = {**os.environ, 'CARGO_HOME': str(WORK / 'cargo'), 'CARGO_BUILD_JOBS': '2',
           'CARGO_INCREMENTAL': '0', 'CARGO_PROFILE_DEV_DEBUG': '0',
           'CARGO_PROFILE_RELEASE_DEBUG': '0'}
    if (WORK / 'rustup/settings.toml').is_file():
        env['RUSTUP_HOME'] = str(WORK / 'rustup')
    for name in ['RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'RUSTC']:
        env.pop(name, None)
    return env


def disk_preflight(required):
    free = shutil.disk_usage(ROOT).free
    if free < required:
        raise RuntimeError(f'Insufficient free disk: {free} bytes; preflight requires {required}. No files were deleted.')


def atomic_json(path, value):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile('w', dir=path.parent, prefix='.manifest-', delete=False) as output:
            temporary = Path(output.name)
            json.dump(value, output, indent=2)
            output.write('\n')
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host-only', action='store_true', help='Build only the local witness checker; does not generate a STARK')
    parser.add_argument('--refresh-lock-offline', action='store_true', help='Explicit maintainer operation to regenerate only this experiment lockfile offline')
    args = parser.parse_args()
    cargo = cargo_path()
    env = environment()
    manifest = GUEST / 'Cargo.toml'
    disk_preflight((256 if args.host_only else 1024) * 1024 * 1024)

    if args.refresh_lock_offline:
        subprocess.run([str(cargo), 'generate-lockfile', '--offline', '--manifest-path', str(manifest)], env=env, check=True)

    if args.host_only:
        host_target = WORK / 'native512-host'
        subprocess.run([str(cargo), 'build', '--locked', '--offline', '--manifest-path', str(manifest), '--bin', HOST_BIN],
                       env={**env, 'CARGO_TARGET_DIR': str(host_target)}, check=True)
        print(json.dumps({'host_checker': str(host_target / 'debug' / HOST_BIN),
                          'cryptographic_proof': False, 'aegis_target_met': False, 'production_ready': False}))
        return

    if os.uname().sysname != 'Linux' or os.uname().machine != 'x86_64':
        raise RuntimeError('Pinned native experiment requires Linux x86_64')
    tools_lock = json.loads((ENGINE / 'tools.lock.json').read_text())
    rustc = executable(WORK / 'risc0/toolchain/bin/rustc', 'pinned guest rustc')
    r0vm = executable(WORK / 'risc0/bin/r0vm', 'pinned r0vm')
    verifier = executable(WORK / 'stark-target/host/release/aegis-stark-verifier', 'existing pack/verifier')
    if sha(r0vm) != tools_lock['r0vm_sha256']:
        raise RuntimeError('Pinned r0vm checksum mismatch')
    flags = ['-C', 'passes=lower-atomic', '-C', 'link-arg=-Ttext=0x00200800', '-C', 'link-arg=--fatal-warnings',
             '-C', 'panic=abort', '--cfg', 'getrandom_backend="custom"',
             '--remap-path-prefix=' + str(ROOT) + '=/aegis',
             '--remap-path-prefix=' + str(WORK / 'cargo') + '=/cargo']
    target_dir = WORK / 'native512-target'
    guest_env = {**env, 'RUSTC': str(rustc), 'CARGO_TARGET_DIR': str(target_dir),
                 'CARGO_ENCODED_RUSTFLAGS': '\x1f'.join(flags)}
    subprocess.run([str(cargo), 'build', '--release', '--locked', '--offline', '--features', 'zkvm',
                    '--target', TARGET, '--manifest-path', str(manifest), '--bin', PACKAGE], env=guest_env, check=True)
    elf = target_dir / TARGET / 'release' / PACKAGE
    output_dir = WORK / 'native512'
    output_dir.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output_dir, prefix='.program-', suffix='.bin', delete=False) as f:
            temporary = Path(f.name)
        program_id = subprocess.check_output([str(verifier), 'pack', str(elf), str(temporary)], text=True).strip()
        if not re.fullmatch('[0-9a-f]{64}', program_id):
            raise RuntimeError('Noncanonical experimental image ID')
        result = {'schema': 'AEGIS_EXPERIMENT_NATIVE512_PROGRAM_V1', 'sdk': '3.1.0', 'receipt_kind': 'composite',
                  'program_id': program_id, 'source_files': SOURCES, 'source_sha256': source_sha(),
                  'program_binary_sha256': sha(temporary), 'r0vm_sha256': sha(r0vm), 'verifier_sha256': sha(verifier),
                  'guest_rustc_sha256': sha(rustc), 'guest_flags': flags,
                  'aegis_target_met': False, 'production_ready': False,
                  'security_note': 'Experimental financial512 program only. RISC Zero 3.1.0/Poseidon2/50-query parameters are unchanged; PQ128 is NOT demonstrated and no node accepts this program.'}
        os.replace(temporary, output_dir / 'program.bin')
        atomic_json(output_dir / 'program.json', result)
        print(json.dumps(result, indent=2))
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
