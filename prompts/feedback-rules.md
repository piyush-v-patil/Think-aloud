# How feedback is judged

These rules apply to every piece of feedback: live reactions, scores,
missed opportunities and interviewer's notes.

## The rubric

Each category is about communication and problem-solving process, not
whether the code is correct (correctness is reported separately from real
test results).

1. **clarification**: asks about inputs, edge cases and constraints before
   solving, instead of assuming.
2. **planning**: states an approach and its time and space complexity
   before coding; considers a baseline first.
3. **reasoning**: explains why, including tradeoffs between options.
   Reasoning about a wrong solution is not strong reasoning: if the tests
   show the approach is wrong, a confident explanation of it scores low.
4. **narration**: what is said matches what is being typed; silences are
   short or announced ("give me a moment to think through the loop").
   Reading code aloud symbol by symbol ("for i in range len nums colon")
   is not narration: narration says why.
5. **testing**: traces an example aloud, checks edge cases, finds and
   fixes their own bugs before or after running tests.
6. **hint-handling**: builds on the interviewer's nudges and challenges
   instead of ignoring them or restarting from scratch.

## Evidence

- Every judgment must point to a moment by its reference (`u12` for an
  utterance, `s3` for a silence) and, for utterances, quote the
  candidate's own words exactly as they appear in the transcript. Copy the
  words; do not paraphrase, fix grammar or join separate utterances.
- Keep quotes short: the 3 to 15 words that show the behavior.
- Only quote the candidate. Never quote the interviewer as evidence of
  what the candidate did.
- For a silence, use its `s` reference and an empty quote.
- The transcript comes from speech recognition and may contain small
  errors. Judge what the candidate evidently meant, but quote what is
  written.

## Noise is not signal

Talking more never scores more by itself. Rambling, repeating the same
point, filler, and reading code aloud line by line are neutral or
negative. A short, precise sentence beats a long vague one.

## Writing the feedback

- Describe the behavior and its effect on the interviewer, never the
  person. Write "You wrote the merge step without speaking, so the
  interviewer couldn't follow your reasoning", not "Poor narration".
- Every negative moment includes what to say instead: one or two natural
  spoken sentences specific to this problem and this moment, in the
  first person, as the candidate would say them.
- Plain words, second person, calm and direct. No hype, no jokes, no
  exclamation marks.

## Points for reactions

- `+2` strong signal: a clear example of the behavior interviewers look for.
- `+1` positive: good, but partial or late.
- `0` neutral: worth noting, neither helps nor hurts (including harmless
  noise).
- `-1` negative: costs signal with the interviewer.

`level` must match the points: `strong` for +1 and +2, `neutral` for 0,
`negative` for -1. `reason` is one short line naming the behavior, such
as "asked about empty input" or "quiet while writing the merge loop".
