/**
 * Turns session events into the text log the models read. The log is
 * append-only so earlier entries form a stable prefix that providers can
 * cache; only the newest entries are new tokens.
 */
import type { CodeSnapshot, Language, Phase, TestRun, Utterance } from '../types';
import { formatClock, formatDuration } from '../time';

export type LogEntry =
  | { kind: 'utterance'; utterance: Utterance }
  | { kind: 'code'; snapshot: CodeSnapshot; language: Language }
  | { kind: 'tests'; run: TestRun }
  | { kind: 'silence'; t: number; ms: number; codeChanged: boolean }
  | { kind: 'time'; t: number; remainingMs: number }
  | { kind: 'phase'; t: number; phase: Phase }
  | { kind: 'note'; t: number; text: string };

export function entryTime(e: LogEntry): number {
  switch (e.kind) {
    case 'utterance':
      return e.utterance.t0;
    case 'code':
      return e.snapshot.t;
    case 'tests':
      return e.run.t;
    default:
      return e.t;
  }
}

export function formatEntry(e: LogEntry): string {
  const at = `[${formatClock(entryTime(e))}]`;
  switch (e.kind) {
    case 'utterance': {
      const who = e.utterance.speaker === 'user' ? 'Candidate' : 'Interviewer';
      return `${at} ${who}: "${e.utterance.text}"`;
    }
    case 'code':
      return `${at} Code now (${e.language}):\n\`\`\`\n${e.snapshot.code.trimEnd()}\n\`\`\``;
    case 'tests': {
      if (e.run.error) return `${at} Ran the code: it failed to run. ${e.run.error}`;
      if (!e.run.total) return `${at} Ran the code.${e.run.stdout ? ` Output: ${truncate(e.run.stdout, 300)}` : ''}`;
      const failed = e.run.results
        .filter((r) => !r.passed)
        .slice(0, 3)
        .map((r) =>
          r.hidden
            ? `a hidden test ("${r.name}")`
            : `"${r.name}" expected ${short(r.expected)}, ${r.error ? `raised ${r.error}` : `got ${short(r.actual)}`}`,
        );
      return `${at} Ran tests: ${e.run.passed} of ${e.run.total} passed.${failed.length ? ` Failed: ${failed.join('; ')}.` : ''}`;
    }
    case 'silence':
      return `${at} ${formatDuration(e.ms)} of silence${e.codeChanged ? ' while typing' : ', no code changes'}.`;
    case 'time':
      return `${at} ${formatDuration(e.remainingMs)} left in the interview.`;
    case 'phase':
      return `${at} Phase is now: ${e.phase}.`;
    case 'note':
      return `${at} ${e.text}`;
  }
}

function short(v: unknown): string {
  return truncate(JSON.stringify(v) ?? 'nothing', 80);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Problem and analysis, shared by every model that reads the session. */
export function problemBrief(problem: import('../types').Problem, includeAnalysis = true): string {
  const parts = [
    `# Problem: ${problem.title}`,
    problem.statement,
    problem.examples.length ? `Examples:\n${problem.examples.map((e) => `- Input: ${e.input} Output: ${e.output}${e.explanation ? ` (${e.explanation})` : ''}`).join('\n')}` : '',
    `Function: ${problem.signature.name}(${problem.signature.params.map((p) => `${p.name}: ${p.type}`).join(', ')}) -> ${problem.signature.returns}`,
  ];
  if (includeAnalysis && problem.analysis) {
    const a = problem.analysis;
    parts.push(
      '# Private analysis (never reveal directly)',
      `Clarifying questions and answers:\n${a.clarifyingQuestions.map((q) => `- Q: ${q.question} A: ${q.answer}`).join('\n')}`,
      `Constraints to reveal only if asked:\n${a.hiddenConstraints.map((c) => `- ${c}`).join('\n')}`,
      `Edge cases:\n${a.edgeCases.map((e) => `- ${e.input}: ${e.why}`).join('\n')}`,
      `Approaches:\n${a.approaches.map((p) => `- ${p.name}: ${p.idea} Time ${p.time}, space ${p.space}. ${p.tradeoffs}`).join('\n')}`,
      `Optimal: ${a.optimal.name}. ${a.optimal.explanation} Time ${a.optimal.time}, space ${a.optimal.space}.`,
      `Hint ladder (vague to specific):\n${a.hintLadder.map((h, i) => `${i + 1}. ${h}`).join('\n')}`,
      `Expected mentions (id: what):\n${a.expectedMentions.map((m) => `- ${m.id} [${m.category}]: ${m.what}`).join('\n')}`,
      `Follow-ups:\n${a.followUps.map((f) => `- ${f}`).join('\n')}`,
      `Reference solution (Python):\n\`\`\`\n${a.referenceSolution.python.trimEnd()}\n\`\`\``,
    );
  }
  return parts.filter(Boolean).join('\n\n');
}
