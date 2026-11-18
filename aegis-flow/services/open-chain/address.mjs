import {canonicalSerialize} from '../../libs/crypto-core/canonical-transcript.mjs';
import {kemRecipientTag} from '../../libs/crypto-core/pqc-wrapper.mjs';
import {openNetworkId} from './consensus.mjs';
const PREFIX='aegis_pow_receive2_';
export function receiveAddress(config,identity){return PREFIX+Buffer.from(canonicalSerialize({schema:'AEGIS_POW_RECEIVE_V2',config_id:openNetworkId(config),owner_tag:identity.owner_tag,kem_public_key:identity.kem_public_key})).toString('base64url');}
export function parseReceiveAddress(address,config){
 if(typeof address!=='string'||address.length>8192||!address.startsWith(PREFIX))throw Error('INVALID_POW_RECIPIENT');
 const encoded=address.slice(PREFIX.length),bytes=Buffer.from(encoded,'base64url');
 if(bytes.toString('base64url')!==encoded)throw Error('INVALID_POW_RECIPIENT');
 const value=JSON.parse(bytes.toString('utf8'));
 if(canonicalSerialize(value)!==bytes.toString('utf8')||Object.keys(value).sort().join(',')!=='config_id,kem_public_key,owner_tag,schema'||value.schema!=='AEGIS_POW_RECEIVE_V2'||value.config_id!==openNetworkId(config)||!/^([0-9a-f]{64})$/.test(value.owner_tag))throw Error('INVALID_POW_RECIPIENT');
 kemRecipientTag(value.kem_public_key,'ML-KEM-768');return value;
}
