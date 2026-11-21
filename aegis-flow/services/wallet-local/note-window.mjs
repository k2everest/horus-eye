import {noteCommitmentV2,noteNullifierV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
export const NOTE_WINDOW=4096;
// The encrypted vault is a bounded spend window, not a lifetime note archive.
// Deferred openings remain recoverable from the verified ciphertext history.
export function noteWindow({existing,spendSecret,isSpent,limit=NOTE_WINDOW}){
 const notes=new Map(),deferred=new Map();let firstDeferred;
 const add=(note,height)=>{
  const commitment=noteCommitmentV2(note);
  if(notes.has(commitment)||isSpent(noteNullifierV2(note,spendSecret)))return;
  if(notes.size<limit){notes.set(commitment,note);return;}
  if(firstDeferred===undefined)firstDeferred=height;
  const item=deferred.get(note.asset_id)??{count:0,value:0n};item.count++;item.value+=BigInt(note.value);deferred.set(note.asset_id,item);
 };
 for(const note of existing)add(note,0);
 return{add,notes,deferred,get firstDeferred(){return firstDeferred;}};
}
