import { reviewStarkSecurity } from '../services/proof-engine/security-review.mjs';

const args = process.argv.slice(2);
let sourceRoot;
let requireProduction = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--require-production') requireProduction = true;
  else if (args[i] === '--source-root' && args[i + 1] && !args[i + 1].startsWith('--')) sourceRoot = args[++i];
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
const report = reviewStarkSecurity({ sourceRoot });
console.log(JSON.stringify(report, null, 2));
if (!report.inventory_matches || (requireProduction && !report.target_met)) process.exitCode = 1;
