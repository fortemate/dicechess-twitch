import { cpus } from 'node:os';
import { generateCandidates } from '../src/engine/generator.ts';
import { candidatePolicy } from '../src/engine/types.ts';
import { fixtures } from '../tests/candidate-fixtures.ts';

const results = [];
for (const fixture of ['opening', 'kingSafety', 'highBranching'] as const) {
  const runs = [];
  for (let iteration = 0; iteration < 3; iteration++) {
    const result = await generateCandidates({
      sessionId: 'benchmark',
      positionVersion: 0,
      roundId: `${fixture}-${iteration}`,
      rolledDfen: fixtures[fixture],
      seed: 17,
    });
    runs.push({
      elapsedMs: Math.round(result.analysis.elapsedMs),
      status: result.status,
      reason: result.reason,
      choices: result.choices.length,
      scored: result.analysis.scored.length,
      legalPaths: result.analysis.legalPaths,
      uniqueStates: result.analysis.uniqueStates,
    });
  }
  const elapsed = runs.map((run) => run.elapsedMs).sort((a, b) => a - b);
  results.push({
    fixture,
    rolledDfen: fixtures[fixture],
    runs,
    minMs: elapsed[0],
    medianMs: elapsed[1],
    maxMs: elapsed[2],
  });
}
console.log(
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
      engine: '0.14.9',
      policy: candidatePolicy,
      results,
    },
    null,
    2,
  ),
);
