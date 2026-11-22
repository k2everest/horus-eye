// Prints only public, abstract model parameters and exact conditional bounds.
// This is not a cryptographic proof generator or a qualification command.
import {searchConditionalParameters} from './parameter-search.mjs';
const args=process.argv.slice(2);let targetFailureBits=1;
if(args.length){
  if(args.length!==2||args[0]!=='--target-failure-bits'||!/^(1|128)$/.test(args[1]))
    throw new Error('usage: parameter-search-demo.mjs [--target-failure-bits 1|128]');
  targetFailureBits=Number(args[1]);
}
console.log(JSON.stringify(searchConditionalParameters({targetFailureBits}),null,2));
