#!/usr/bin/env python3
"""Build the pinned liboqs laboratory helper entirely under work/oqs.

Requires 1 GiB free space, CMake >= 3.15, GCC >= 7.1 and make. Downloads
only the checksum-pinned source archive after all preflight checks pass.
Existing source/build directories are retained; no global install is used.
This laboratory build does not establish PQ128 or production readiness.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUTPUT = ROOT / 'work' / 'oqs'
LOCK = HERE / 'tools.lock.json'
VERSION = '0.16.0'
COMMIT = '5a1a854b0dc9f2141bdc771c555ee60c37950183'
ARCHIVE_ROOT = f'liboqs-{COMMIT}'
FREE_SPACE_REQUIRED = 1024 * 1024 * 1024
ARCHIVE_BYTES_MAX = 128 * 1024 * 1024
EXTRACTED_BYTES_MAX = 768 * 1024 * 1024
ARCHIVE_FILES_MAX = 100000
HELPER_RELATIVE = 'bin/aegis-oqs-helper'
EXPECTED_METADATA = {
    'liboqs_version': VERSION,
    'allowed_algorithms': ['ML-DSA-87', 'ML-KEM-1024'],
    'sizes': {
        'ML-DSA-87': {'public_key': 2592, 'signature': 4627},
        'ML-KEM-1024': {'public_key': 1568, 'ciphertext': 1568, 'shared_secret': 32},
    },
    'aegis_target_met': False,
    'production_ready': False,
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def command_version(command, arguments, pattern, minimum):
    executable = shutil.which(command)
    if not executable:
        raise RuntimeError(f'Preflight: {command} is required; no files were downloaded or deleted')
    result = subprocess.run([executable, *arguments], check=True, text=True, capture_output=True)
    match = re.search(pattern, result.stdout)
    if not match or tuple(int(part or '0') for part in match.groups()) < minimum:
        raise RuntimeError(f'Preflight: unsupported {command} version')
    return executable


def preflight():
    # Check disk before network access, creating directories, or invoking builds.
    free = shutil.disk_usage(ROOT).free
    if free < FREE_SPACE_REQUIRED:
        raise RuntimeError(f'Preflight: {free} free bytes; at least {FREE_SPACE_REQUIRED} required. '
                           'No files were downloaded or deleted')
    if os.uname().sysname != 'Linux':
        raise RuntimeError('Preflight: this helper build requires Linux')
    cmake = command_version('cmake', ['--version'], r'cmake version (\d+)\.(\d+)\.(\d+)', (3, 15, 0))
    gcc = command_version('gcc', ['-dumpfullversion', '-dumpversion'], r'(\d+)\.(\d+)(?:\.(\d+))?', (7, 1, 0))
    if not shutil.which('make'):
        raise RuntimeError('Preflight: make is required; no files were downloaded or deleted')
    # Refuse redirected output roots so installation stays in the repository.
    for path in [ROOT / 'work', OUTPUT]:
        if path.is_symlink():
            raise RuntimeError('Preflight: work/oqs must not use symbolic links')
    return cmake, gcc


def read_lock():
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    if lock.get('liboqs_version') != VERSION or lock.get('source_commit') != COMMIT:
        raise RuntimeError('Pinned liboqs version/commit mismatch')
    if not re.fullmatch(r'[0-9a-f]{64}', lock.get('archive_sha256', '')):
        raise RuntimeError('Pinned liboqs archive checksum is missing or invalid')
    allowed_urls = {
        f'https://codeload.github.com/open-quantum-safe/liboqs/tar.gz/{COMMIT}',
        f'https://github.com/open-quantum-safe/liboqs/archive/{COMMIT}.tar.gz',
    }
    if lock.get('archive_url') not in allowed_urls:
        raise RuntimeError('Only the pinned liboqs commit archive URL is accepted')
    return lock


class ArchiveRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        target = urllib.parse.urlsplit(new_url)
        if target.scheme != 'https' or target.hostname not in {'github.com', 'codeload.github.com'}:
            raise RuntimeError('Unexpected archive redirect')
        return super().redirect_request(request, fp, code, message, headers, new_url)


def download_archive(lock):
    downloads = OUTPUT / 'downloads'
    downloads.mkdir(parents=True, exist_ok=True)
    archive = downloads / f'liboqs-{COMMIT}.tar.gz'
    if archive.exists():
        if archive.is_symlink() or not archive.is_file() or sha256(archive) != lock['archive_sha256']:
            raise RuntimeError('Existing archive checksum mismatch; no existing files were deleted')
        return archive
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=downloads, prefix='.download-', delete=False) as output:
            temporary = Path(output.name)
            opener = urllib.request.build_opener(ArchiveRedirects())
            request = urllib.request.Request(lock['archive_url'], headers={'User-Agent': 'aegis-oqs-laboratory-builder'})
            total = 0
            with opener.open(request, timeout=60) as response:
                while True:
                    block = response.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    if total > ARCHIVE_BYTES_MAX:
                        raise RuntimeError('Source archive exceeds size limit')
                    output.write(block)
        if sha256(temporary) != lock['archive_sha256']:
            raise RuntimeError('Downloaded archive checksum mismatch')
        os.replace(temporary, archive)
        return archive
    finally:
        # Remove only the temporary download created by this invocation.
        if temporary is not None and temporary.exists():
            temporary.unlink()


def extract_archive(archive, destination):
    """Extract only bounded regular files/directories beneath the pinned root.

    No symlinks, hardlinks, devices, traversal, duplicate paths or overwrite.
    Manual extraction works consistently before Python's tar filter defaults.
    """
    seen = set()
    total = 0
    count = 0
    with tarfile.open(archive, 'r:gz') as source:
        for member in source:
            count += 1
            if count > ARCHIVE_FILES_MAX:
                raise RuntimeError('Source archive has too many entries')
            name = PurePosixPath(member.name)
            if (not name.parts or name.parts[0] != ARCHIVE_ROOT or name.is_absolute()
                    or '..' in name.parts or '\\' in member.name or '\x00' in member.name
                    or not (member.isdir() or member.isreg())):
                raise RuntimeError('Unsafe source archive entry')
            if name in seen:
                raise RuntimeError('Duplicate source archive entry')
            seen.add(name)
            target = destination.joinpath(*name.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if member.size < 0:
                raise RuntimeError('Invalid source archive size')
            total += member.size
            if total > EXTRACTED_BYTES_MAX:
                raise RuntimeError('Expanded source archive exceeds size limit')
            target.parent.mkdir(parents=True, exist_ok=True)
            stream = source.extractfile(member)
            if stream is None:
                raise RuntimeError('Unreadable source archive entry')
            with stream, target.open('xb') as output:
                remaining = member.size
                while remaining:
                    block = stream.read(min(remaining, 1024 * 1024))
                    if not block:
                        raise RuntimeError('Truncated source archive entry')
                    output.write(block)
                    remaining -= len(block)
            # Keep executable source scripts executable without special bits.
            target.chmod(0o755 if member.mode & 0o111 else 0o644)
    root = destination / ARCHIVE_ROOT
    if not (root / 'CMakeLists.txt').is_file():
        raise RuntimeError('Pinned archive is missing the liboqs build configuration')
    return root


def atomic_json(path, value):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent,
                                         prefix='.manifest-', delete=False) as output:
            temporary = Path(output.name)
            json.dump(value, output, indent=2)
            output.write('\n')
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preflight-only', action='store_true', help='Check tools, disk and pins without writing or downloading')
    parser.add_argument('--jobs', type=int, choices=range(1, 17), default=2, help='Parallel compiler jobs (default: 2)')
    args = parser.parse_args()
    cmake, gcc = preflight()
    lock = read_lock()
    if args.preflight_only:
        print(json.dumps({'preflight': True, 'liboqs_version': VERSION, 'source_commit': COMMIT,
                          'aegis_target_met': False, 'production_ready': False}))
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in ['downloads', 'bin']:
        if (OUTPUT / name).is_symlink():
            raise RuntimeError('Build output directories must not use symbolic links')
    archive = download_archive(lock)
    # Preserve each invocation's source/build tree, including after a failure.
    run = Path(tempfile.mkdtemp(prefix=f'build-{VERSION}-', dir=OUTPUT))
    source = extract_archive(archive, run)
    build = run / 'build'
    # A fresh prefix prevents an earlier install tree (or symlinks within it)
    # from being followed or overwritten. Keep the complete run for review.
    install = run / 'install'
    flags = [
        '-G', 'Unix Makefiles',
        '-DCMAKE_BUILD_TYPE=Release',
        f'-DCMAKE_C_COMPILER={gcc}',
        f'-DCMAKE_INSTALL_PREFIX={install}',
        '-DCMAKE_INSTALL_LIBDIR=lib',
        '-DCMAKE_INSTALL_INCLUDEDIR=include',
        '-DBUILD_SHARED_LIBS=OFF',
        '-DOQS_BUILD_ONLY_LIB=ON',
        '-DOQS_DIST_BUILD=ON',
        '-DOQS_USE_OPENSSL=OFF',
        '-DOQS_MINIMAL_BUILD=KEM_ml_kem_1024;SIG_ml_dsa_87',
    ]
    environment = dict(os.environ)
    # Do not permit ambient flags/library search paths to alter this build.
    for key in ['CC', 'CFLAGS', 'CPPFLAGS', 'LDFLAGS', 'LIBRARY_PATH', 'CPATH',
                'C_INCLUDE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DESTDIR']:
        environment.pop(key, None)
    subprocess.run([cmake, '-S', str(source), '-B', str(build), *flags], env=environment, check=True)
    subprocess.run([cmake, '--build', str(build), '--parallel', str(args.jobs)], env=environment, check=True)
    subprocess.run([cmake, '--install', str(build)], env=environment, check=True)
    staged_helper = run / 'aegis-oqs-helper'
    subprocess.run([gcc, '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
                    '-fstack-protector-strong', '-D_FORTIFY_SOURCE=2', '-Wl,-z,relro,-z,now',
                    '-I', str(install / 'include'), str(HERE / 'bridge.c'),
                    str(install / 'lib/liboqs.a'), '-pthread', '-lm', '-o', str(staged_helper)],
                   env=environment, check=True)
    metadata = subprocess.run([str(staged_helper), 'metadata'], input=b'', capture_output=True,
                              env=environment, check=True, timeout=10)
    if metadata.stderr or json.loads(metadata.stdout) != EXPECTED_METADATA:
        raise RuntimeError('Native helper metadata did not match the pinned laboratory build')
    result = {
        'schema': 'AEGIS_OQS_LABORATORY_BUILD_V1',
        'liboqs_version': VERSION,
        'source_commit': COMMIT,
        'bridge_source_sha256': sha256(HERE / 'bridge.c'),
        'archive_sha256': lock['archive_sha256'],
        'binary_sha256': sha256(staged_helper),
        'helper_path': HELPER_RELATIVE,
        'aegis_target_met': False,
        'production_ready': False,
    }
    helper = OUTPUT / HELPER_RELATIVE
    helper.parent.mkdir(parents=True, exist_ok=True)
    os.replace(staged_helper, helper)
    atomic_json(OUTPUT / 'manifest.json', result)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, tarfile.TarError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error))
