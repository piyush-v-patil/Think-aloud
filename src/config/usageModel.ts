/**
 * Token-usage model for the cost estimate before a session. These are
 * starting assumptions; once you have 3 or more sessions, the estimate uses
 * your own averages instead. Tune them here if real usage drifts.
 */
export const USAGE_MODEL = {
  /** Stable prompt prefix: instructions, problem and its analysis. */
  basePrefixTokens: 5500,
  /** Transcript, code and test events added per minute of interview. */
  transcriptTokensPerMinute: 160,
  /** Uncached tail of each live call: current code and the new turn. */
  perCallUncachedTokens: 450,
  interviewer: {
    callsPerMinute: 1.4,
    /** Includes the short reasoning the model does before answering. */
    outputTokensPerCall: 160,
  },
  reactions: {
    /** Training: after most finished answers. */
    trainingCallsPerMinute: 0.9,
    trainingOutputTokensPerCall: 220,
    /** Delayed: one call per phase. */
    delayedCalls: 5,
    delayedOutputTokensPerCall: 700,
  },
  debrief: {
    /** Code history and test results added to the scoring prompt. */
    codeHistoryTokens: 3000,
    scoringOutputTokens: 6000,
    /** Extra output when every reaction is written in the debrief (Realistic mode). */
    realisticExtraOutputTokens: 2500,
    verificationOutputTokens: 2500,
  },
  /** Preparing a pasted problem (once; cached locally after). */
  analysis: { inputTokens: 1800, outputTokens: 11000 },
} as const;
