#!/usr/bin/env python3
"""Install pinned Linux/x64 RISC Zero tools inside work/ and build the approved guest.
Requires an installed Rust host toolchain (cargo). Never installs into the home directory.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / 'aegis-flow/services/proof-engine'
WORK = ROOT / 'work'
TOOLS = WORK / 'risc0'
LOCK = json.loads((ENGINE / 'tools.lock.json').read_text())
MANIFEST = ENGINE / 'program.json'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def fetch(url, checksum, destination):
    with urllib.request.urlopen(url) as response, destination.open('wb') as output:
        shutil.copyfileobj(response, output)
    if sha(destination) != checksum:
        destination.unlink()
        raise RuntimeError('Downloaded tool checksum mismatch')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--update-program-manifest', action='store_true', help='Maintainer operation: record a newly built guest ID for review')
    args = parser.parse_args()
    if os.uname().sysname != 'Linux' or os.uname().machine != 'x86_64':
        raise RuntimeError('Pinned prover tools currently support Linux x86_64 only')
    cargo = WORK / 'cargo/bin/cargo'
    if not cargo.exists() or not (WORK / 'rustup/settings.toml').is_file():
        cargo = Path(shutil.which('cargo') or '')
        if not cargo.is_file():
            raise RuntimeError('Install a Rust host toolchain with cargo before running setup-stark.py')
    TOOLS.mkdir(parents=True, exist_ok=True)
    r0vm = TOOLS / 'bin/r0vm'
    if not r0vm.exists():
        archive = TOOLS / 'cargo-risczero.tgz'
        fetch(LOCK['archive_url'], LOCK['archive_sha256'], archive)
        with tarfile.open(archive) as tar:
            tar.extractall(TOOLS / 'bin', filter='data')
    if sha(r0vm) != LOCK['r0vm_sha256']:
        raise RuntimeError('Pinned r0vm checksum mismatch')
    r0vm.chmod(0o755)
    rustc = TOOLS / 'toolchain/bin/rustc'
    if not rustc.exists():
        archive = TOOLS / 'rust-toolchain.tar.gz'
        fetch(LOCK['toolchain_url'], LOCK['toolchain_sha256'], archive)
        with tarfile.open(archive) as tar:
            tar.extractall(TOOLS / 'toolchain', filter='data')
        archive.unlink()
    env = {**os.environ, 'CARGO_HOME': str(WORK / 'cargo'), 'CARGO_BUILD_JOBS': '2'}
    if (WORK / 'rustup/settings.toml').is_file():
        env['RUSTUP_HOME'] = str(WORK / 'rustup')
    env.pop('RUSTFLAGS', None)
    env.pop('CARGO_ENCODED_RUSTFLAGS', None)
    env.pop('RUSTC', None)
    subprocess.run([str(cargo), 'build', '--release', '--locked', '--manifest-path', str(ENGINE / 'verifier/Cargo.toml')],
                   env={**env, 'CARGO_TARGET_DIR': str(WORK / 'stark-target/host')}, check=True)
    flags = ['-C', 'passes=lower-atomic', '-C', 'link-arg=-Ttext=0x00200800', '-C', 'link-arg=--fatal-warnings',
             '-C', 'panic=abort', '--cfg', 'getrandom_backend="custom"',
             '--remap-path-prefix=' + str(ROOT) + '=/aegis',
             '--remap-path-prefix=' + str(WORK / 'cargo') + '=/cargo']
    guest_env = {**env, 'RUSTC': str(rustc), 'CARGO_TARGET_DIR': str(WORK / 'stark-target/guest'),
                 'CARGO_ENCODED_RUSTFLAGS': '\x1f'.join(flags)}
    subprocess.run([str(cargo), 'build', '--release', '--locked', '--target', 'riscv32im-risc0-zkvm-elf',
                    '--manifest-path', str(ENGINE / 'guest/Cargo.toml')], env=guest_env, check=True)
    verifier = WORK / 'stark-target/host/release/aegis-stark-verifier'
    guest = WORK / 'stark-target/guest/riscv32im-risc0-zkvm-elf/release/aegis-transfer-guest'
    program = TOOLS / 'aegis-transfer.bin'
    image_id = subprocess.check_output([str(verifier), 'pack', str(guest), str(program)], text=True).strip()
    manifest = json.loads(MANIFEST.read_text())
    source_hash = hashlib.sha256()
    for name in manifest['source_files']:
        source_hash.update(name.encode() + b'\0' + (ENGINE / name).read_bytes())
    actual = {**manifest, 'program_id': image_id, 'source_sha256': source_hash.hexdigest(), 'program_binary_sha256': sha(program)}
    if args.update_program_manifest:
        MANIFEST.write_text(json.dumps(actual, indent=2) + '\n')
        print('Updated trusted program manifest; review this change before release.')
    elif actual != manifest:
        raise RuntimeError('Built STARK program differs from trusted manifest; no proof engine will be enabled')
    print('STARK backend built. Trusted image ID:', image_id)


if __name__ == '__main__':
    main()
