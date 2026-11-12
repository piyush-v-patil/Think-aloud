# Contributing

Thanks for helping. Three principles guide every change:

1. **Trust.** Every score and reaction is tied to a quoted, timestamped
   moment that code has checked against the transcript.
2. **Quality first, no wasted tokens.** Never replace a judgment with a
   rule, and never use a model for something code can count. Save tokens
   with caching and precomputation, not by making the model dumber.
3. **The user's keys and data are theirs.** No server of ours, ever.

Before opening a pull request, run:

```bash
npm run lint && npm run typecheck && npm test
npm run problems:validate && npm run problems:check-solutions
```

CI runs the same checks on every pull request.

## Adding a problem

Problems live in `problems/<id>.json`, one per file. The schema is defined
in `src/lib/problems/schema.ts` (zod) and published as
`schema/problem.schema.json` (regenerate with
`npm run problems:validate -- --write-schema`).

**Write the problem yourself.** This repository is public and must never
contain text from LeetCode or any other site. Use your own scenario,
wording and examples. (Users can keep links to outside problems in their
own list and paste the text locally; that text never enters the repo.)

A problem needs:

- `id` (kebab-case, matching the file name), `title`, `difficulty`,
  `topics`, `statement` (plain text, backticks for identifiers),
  `examples`.
- `signature`: the function name and parameter types. Value types are
  listed in the schema; linked lists (`ListNode`) and trees (`TreeNode`)
  are written in tests as arrays, trees in level order with nulls.
- `starterCode` for Python and JavaScript. (Java starter code is generated
  from the signature.)
- `tests`: at least one visible, a few `hidden`, covering the edge cases.
  Use `compare: "unordered"` when any order is accepted,
  `"unordered-deep"` when inner lists are unordered too, `"float"` for
  floating-point answers.
- `analysis`: clarifying questions with answers, hidden constraints, edge
  cases, approaches with complexities, the optimal approach, a hint ladder
  from vague to specific, expected mentions (these become
  missed-opportunity markers), follow-ups, speech vocabulary, reference
  solutions in Python, JavaScript and Java, and a full think-aloud
  walkthrough. The Java solution is a `class Solution` with the camelCase
  method; `npm run problems:check-solutions` runs it on TeaVM (as the
  browser does) and, if a JDK is installed, on the JDK too.

To generate the analysis with a model, write the problem without
`analysis` and run, with your own key:

```bash
ANTHROPIC_API_KEY=... npm run problems:analyze -- --id your-problem-id
```

The script uses the strongest model, checks the reference solutions
against your tests in both languages, retries with the failures, and
writes the file. Review the diff before committing.

## Tuning a prompt

Every prompt is a Markdown file in `prompts/`:

| File | Used for |
|---|---|
| `interviewer.md`, `persona-*.md` | every interviewer reply |
| `reactions.md` | live feedback in Training and Delayed modes |
| `feedback-rules.md` | the rubric and evidence rules shared by all feedback |
| `scoring.md` | the replay's scoring call |
| `verification.md` | the independent check of each judgment |
| `rescore.md` | scoring a re-recorded moment |
| `analysis.md`, `prepare-pasted.md`, `variation.md` | preparing problems |

Guidelines:

- Keep the stable part of a prompt stable. Anything that changes per
  call belongs in the conversation, not the system prompt, or caching
  breaks.
- Never ask a model to count, time or add things up; compute those in
  code and pass them in.
- Output shapes live in `src/lib/feedback/schemas.ts` and are validated in
  code. If you change a shape, update the schema and its tests.
- Interface wording belongs in `src/copy/strings.ts`, not in prompts or
  components.

Tests in `src/lib/feedback/*.test.ts` and `src/lib/interview/*.test.ts`
run the pipeline with scripted model output; add a case for the behavior
you are changing.

## Adding an AI provider

1. Implement `AIProvider` (`src/lib/ai/types.ts`): streaming `chat`,
   structured `json` (validate with the zod schema you are given),
   `checkKey` with a minimal real call, and token usage including cached
   tokens. Map errors to `ProviderError` kinds and pass keys through
   `redact`. Never put a key in a URL. See `openai.ts` and `gemini.ts` for
   fetch-based examples.
2. Add `src/config/providers/<provider>.ts` with models, prices (and the
   date you checked them), and Economy, Balanced and Best presets, and
   register it in `src/config/providers/index.ts`.
3. Add it to `createProvider` in `src/lib/ai/factory.ts` and to the
   provider list in Settings.
4. Add its API host to `AI_PROVIDER_HOSTS` in `src/config/csp.ts`.
5. Confirm the provider allows direct browser requests (send a CORS
   preflight) and say so in the README.
6. Add adapter tests with `fakeFetch` (`src/lib/ai/testing.ts`).

## Adding a speech engine

- For transcribing the recording after the interview, implement
  `FileTranscriber` (`src/lib/speech/files.ts`), returning words with
  times in seconds from the start of the recording. `alignTranscript`
  puts them on the session clock.
- For live use, implement `LiveTranscriber` (`src/lib/speech/types.ts`),
  reporting phrases with session-clock times.
- Add the engine's prices to `src/config/speech.ts`, its hosts to
  `SPEECH_PROVIDER_HOSTS` in `src/config/csp.ts`, its choice to
  `src/lib/speech/choose.ts`, and its privacy line (where audio goes) to
  the Settings privacy section and the README.
- Pass the problem's vocabulary as keyword hints where the engine supports
  them.
- Test it with `fakeFetch` or a fake WebSocket, as in
  `src/lib/speech/adapters.test.ts`.

## Design and interface text

Read `DESIGN.md` before changing how anything looks. The marked-up
transcript is the one bold element; everything else stays quiet. All
interface text is in `src/copy/strings.ts`: second person, plain words,
sentence case, digits for numbers, buttons that say what happens.
