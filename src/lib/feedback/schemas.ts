/**
 * Shapes the models must return. Fields are required (empty strings when
 * unused) because strict structured output handles required fields best.
 * Ranges are checked in code after parsing.
 */
import { z } from 'zod';
import { rubricSchema } from '../problems/schema';

export const reactionOut = z.object({
  ref: z.string().describe('Moment reference, like u12 or s3'),
  quote: z.string().describe("The candidate's exact words; empty for a silence"),
  category: rubricSchema,
  level: z.enum(['strong', 'neutral', 'negative']),
  points: z.number().describe('+2, +1, 0 or -1'),
  reason: z.string().describe('One short line naming the behavior'),
  sayInstead: z.string().describe('For negative reactions: what to say instead. Empty otherwise.'),
});
export type ReactionOut = z.infer<typeof reactionOut>;

export const liveReactionsOut = z.object({
  reactions: z.array(reactionOut),
  stuck: z.object({
    isStuck: z.boolean(),
    recoveryLine: z.string().describe('A sentence the candidate could say to get unstuck, or empty'),
  }),
});

export const evidenceOut = z.object({ ref: z.string(), quote: z.string() });

export const scoringOut = z.object({
  scores: z.array(
    z.object({
      category: rubricSchema,
      score: z.number().describe('1 to 4'),
      summary: z.string(),
      evidence: z.array(evidenceOut),
    }),
  ),
  correctness: z.object({ summary: z.string() }),
  hireSignal: z.enum(['strong-no', 'lean-no', 'lean-yes', 'strong-yes']),
  hireSummary: z.string(),
  reactions: z.array(reactionOut),
  missed: z.array(
    z.object({
      mentionId: z.string(),
      what: z.string(),
      category: rubricSchema,
      ref: z.string(),
      sayInstead: z.string(),
    }),
  ),
  notes: z.array(z.object({ text: z.string(), ref: z.string() })),
  narrations: z.array(z.object({ target: z.string().describe('r0, r1... or m0, m1...'), text: z.string() })),
});
export type ScoringOut = z.infer<typeof scoringOut>;

export const repairOut = z.object({
  scores: z.array(z.object({ category: rubricSchema, evidence: z.array(evidenceOut) })),
});

export const verificationOut = z.object({
  items: z.array(
    z.object({
      id: z.string().describe('S1, R3, M2, N4...'),
      verdict: z.enum(['keep', 'downgrade', 'remove']),
      newValue: z.number().describe('For downgrades: the new score or points; 0 otherwise'),
      reason: z.string(),
    }),
  ),
  hireSignal: z.object({ verdict: z.enum(['keep', 'downgrade']), value: z.enum(['strong-no', 'lean-no', 'lean-yes', 'strong-yes']), reason: z.string() }),
});
export type VerificationOut = z.infer<typeof verificationOut>;

export const rescoreOut = z.object({
  verdict: z.enum(['better', 'same', 'worse']),
  points: z.number().describe('+2, +1, 0 or -1 for the new attempt'),
  reason: z.string(),
  quote: z.string().describe('Exact words from the new attempt that show it'),
});
