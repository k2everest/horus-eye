import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(git(['status','--porcelain']))throw new Error('RELEASE_REQUIRES_CLEAN_COMMIT');
const commit=git(['rev-parse','HEAD']);
const tag=`aegis-flow/validation-gateway:${commit}`;
const args=['build','--platform','linux/amd64','--label',`org.opencontainers.image.revision=${commit}`,'--label','org.opencontainers.image.source=horus-eye/aegis-flow',
 '-f','aegis-flow/services/validation-gateway/Dockerfile','-t',tag];
if(process.env.AEGIS_BUILD_CA_FILE)args.push('--secret',`id=build_ca,src=${process.env.AEGIS_BUILD_CA_FILE}`);
args.push('aegis-flow');
execFileSync('docker',args,{cwd:root,stdio:'inherit'});
console.log(JSON.stringify({image_tag:tag,source_commit:commit,production_ready:false}));
