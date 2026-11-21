import{statfsSync}from'node:fs';
export function assertFreeSpace(directory,requiredBytes,{reserveBytes=16*1024*1024,readStats=statfsSync}={}){
 if((typeof requiredBytes!=='bigint'&&!Number.isSafeInteger(requiredBytes))||requiredBytes<0||!Number.isSafeInteger(reserveBytes)||reserveBytes<0)throw Error('INVALID_BACKUP_SPACE_BUDGET');
 const stats=readStats(directory,{bigint:true}),available=BigInt(stats.bavail)*BigInt(stats.bsize),required=BigInt(requiredBytes)+BigInt(reserveBytes);
 if(available<required)throw Error('BACKUP_INSUFFICIENT_FREE_SPACE');return{available_bytes:available.toString(),required_bytes:required.toString()};
}
