// Evaluate the exact deployed scoring function, not a second implementation.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const html = fs.readFileSync(process.argv[2], 'utf8');
const start = html.indexOf('function hrEvidenceScore(x){');
const end = html.indexOf('\nfunction renderHrModelLeaderboard', start);
if (start < 0 || end < 0) throw Error('HR scoring function not found');
const source = html.slice(start, end);
const version = 'hr-evidence-' + crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
const context = vm.createContext({});
vm.runInContext(source, context, {timeout:1000});
const rows = JSON.parse(fs.readFileSync(0, 'utf8'));
const scores = rows.map(row => {
  context.candidate = row;
  const result = vm.runInContext('hrEvidenceScore(candidate)', context, {timeout:1000});
  return {modelVersion:version, score:result.score, contributions:result.notes};
});
process.stdout.write(JSON.stringify(scores));
