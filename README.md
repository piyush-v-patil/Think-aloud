# Think Aloud

Practice the one skill coding interviews at Google, Amazon, Meta and
Microsoft quietly score you on: **thinking out loud**. Interviewers judge
your process and communication, not only your final code. You lose points
for coding in silence, skipping clarifying questions, going quiet when
stuck, or reading code aloud without saying why.

Think Aloud is a voice mock interview followed by a timestamped replay.
You come away knowing exactly which moments helped or hurt, and what a
stronger version would have sounded like.

- A model-written interviewer that answers your questions, nudges when
  you're stuck, and challenges your code, by voice.
- A shared editor with Python and JavaScript running in your browser
  against real tests.
- Feedback written as marker on your own words: every score and note
  quotes what you said, with a timestamp, checked in code against your
  transcript and reviewed by a second, independent pass.
- A replay timeline that syncs your audio, your code and the feedback,
  with what a strong candidate might have said at each weak moment, and a
  way to re-record that moment and get it rescored.

It is free and open source, and there is **no backend**. You bring your
own AI key, which stays in your browser.

The app name is a working name; it lives in one place, `src/config/app.ts`.

## Quick start

```bash
npm install        # also copies Pyodide and ONNX Runtime into public/vendor
npm run dev        # http://localhost:5173
```

Open the app, watch the **demo session** (no key needed), then add a key in
**Settings** and start an interview.

```bash
npm test                         # unit and integration tests
npm run lint && npm run typecheck
npm run problems:validate        # problem JSON schema
npm run problems:check-solutions # every reference solution, both languages
npm run build                    # static site in dist/
```

## Getting an AI key

1. Create an account with a provider. Anthropic is the default:
   <https://platform.claude.com/settings/keys>. OpenAI, Google Gemini and any
   OpenAI-compatible endpoint (OpenRouter, Ollama, LM Studio) also work.
2. Add a little credit. $5 covers many sessions.
3. Create an API key, paste it in **Settings**, and choose whether to
   remember it on this device or for this session only. **Save and check
   key** sends one tiny request to confirm the key works and has credit.

## What a session costs

You pay your AI provider directly. Estimates for a 45 minute interview in
Training mode (live feedback), with prices checked on 2026-11-11:

| Provider  | Economy | Balanced (default) | Best   |
|-----------|---------|--------------------|--------|
| Anthropic | $0.03   | $0.72              | $1.44  |
| OpenAI    | $0.03   | $1.15              | $3.37  |
| Gemini    | $0.13   | $0.33              | $0.56  |

Realistic mode (feedback only at the end) costs a little less. Preparing a
pasted problem adds a one-time cost; the result is cached on your device.
Gemini's listed prices for its larger models double on 2026-12-01 and
2027-01-01; the app switches automatically.

The setup screen shows a live estimate as you change the provider, quality
preset, models, speech engine or length. After three sessions it uses your
own averages. After each session you see the actual cost, computed from the
usage the API reported for every call, including cached tokens, broken
down by role, with speech as its own line. History shows spend for the
week and month, with an optional monthly limit.

Speech is free with the browser engine. Optional paid speech engines cost
roughly $0.20 to $0.45 per 45 minute interview.

## Privacy

There is no server of ours. Nothing you do here is sent to the people who
made this app: no keys, recordings, transcripts or usage data. There is no
analytics or tracking, and fonts and runtimes are served from the app's own
origin.

What leaves your device:

- **Text to your AI provider** (the one you choose): the problem, your
  transcript, your code, test results and timing, so the interviewer can
  reply and your feedback can be written. Your key is sent only to that
  provider. (On Google's free tier, Google may use prompts to improve its
  products; on its paid tier it does not.)
- **Audio, depending on the speech engine you choose:**
  - Browser speech recognition (the default): your voice goes to your
    browser's speech service (Google for Chrome and Edge, Apple for
    Safari).
  - On-device Whisper: nowhere. The recording is transcribed on your
    device. The speech model is downloaded from Hugging Face the first
    time; none of your data is sent with that download.
  - A paid engine (Deepgram, AssemblyAI or OpenAI): your audio goes to the
    engine you chose, using your key.
  - Typing instead of speaking: no audio at all.

Everything else stays in your browser's storage: recordings, sessions, your
problem list, settings, and keys if you chose to remember them. **Settings
→ Your data** exports everything (never keys), imports it, or deletes it.
The Settings screen shows this statement for your current choices.

## Browser support

- **Voice**: Chrome, Edge and Safari (Web Speech API). In Firefox, or if
  the microphone is blocked, you type what you'd say instead.
- **Everything else** (editor, code running, replay): any current
  browser. On-device Whisper needs a recent computer; it uses WebGPU when
  available and WebAssembly otherwise.
- Headphones help: the interviewer won't hear its own voice.

## Architecture

A fully static Vite + React + TypeScript + Tailwind site. No server code.

```
prompts/              every prompt, as readable Markdown
problems/             the built-in bank: one JSON file per problem
schema/               generated JSON Schema for problem files
scripts/              maintainer scripts (analysis generation, checks)
src/config/           app name, CSP, models and prices, speech engines, usage model
src/copy/strings.ts   all interface text, in one place
src/lib/ai/           provider interface and adapters (Anthropic, OpenAI, Gemini, compatible)
src/lib/speech/       speech-to-text engines, turn-taking, alignment, Whisper
src/lib/runner/       sandboxed code runner (Pyodide and JS in Web Workers)
src/lib/interview/    the interviewer and the event log it reads
src/lib/feedback/     metrics, reactions, scoring, evidence checks, verification
src/lib/session/      the live interview controller and post-session processing
src/lib/replay/       timeline sync
src/ui/, src/screens/ components and screens; DESIGN.md explains the design
```

How a session works:

1. **Setup.** Built-in problems come with a precomputed analysis (expected
   questions, edge cases, approaches, hint ladder, reference solutions, a
   full think-aloud walkthrough), so they need no analysis call. Pasted
   problems and variations are analyzed once with the strongest model in
   your preset, their tests are checked against the generated reference
   solution, and the result is cached by text.
2. **Interview.** Static code decides *when* to ask a model: a finished
   turn (after a natural pause), a stall (silence with no code change), a
   test run, a phase change, a time mark. What the interviewer says is
   always the model's own reply. Prompts are split so the stable part
   (rules, problem, analysis, earlier transcript) is cached and only the
   new turn is new tokens. Everything is stamped on one session clock:
   speech, code snapshots, test runs and the recording.
3. **Feedback.** Training shows reactions live, Delayed at the end of each
   phase, Realistic only in the replay. Timing metrics (talk-to-silence
   ratio, longest pause, speaking before typing, time per phase) are
   computed in code and passed to the model as inputs.
4. **Replay.** A scoring call reads the full transcript, code history,
   real test results and the analysis. Code then checks every quote
   against your words; scores without findable evidence get one repair
   call. A second, independent verification call removes or lowers
   anything the evidence doesn't support. If a more accurate transcript
   was made from your recording, scoring uses it, and live reactions are
   re-checked against it first.

### Security

Keys live in the browser, so cross-site scripting is the main threat:

- A strict Content Security Policy in production (`src/config/csp.ts`):
  only the app's own scripts, and network access only to the supported AI
  and speech providers.
- Model output and pasted text are never rendered as HTML (a lint rule
  blocks it).
- Your code, and model-written reference solutions, run in Web Workers
  with network and storage access removed, and with a timeout.
- Dependencies are pinned to exact versions. Keys are never logged, never
  put in URLs, and are redacted from error messages.

If you use a custom OpenAI-compatible endpoint other than OpenRouter or
localhost, add its host to `CUSTOM_ENDPOINT_HOSTS` in `src/config/csp.ts`
and rebuild.

## Updating models and prices

Models and prices change. Each provider has one file:

- `src/config/providers/anthropic.ts`, `openai.ts`, `gemini.ts`: model ids,
  prices per million tokens (input, output, cache read, cache write),
  dated price changes, and the Economy, Balanced and Best presets.
- `src/config/speech.ts`: speech engine models and per-minute prices.
- `src/config/usageModel.ts`: the token-usage assumptions behind the cost
  estimate before a user has history.

Each file notes the date its prices were checked and the pricing page.
`npm test` includes checks that presets stay ordered by cost.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on
every push to `main` (enable Pages with "GitHub Actions" as the source).
The build is a plain static site in `dist/` that works on any static host;
it uses relative paths and hash routing, so no server configuration is
needed.

## Known limits

- OpenAI live transcription needs a WebRTC session, and AssemblyAI live
  transcription needs a server-issued token, so those two engines are used
  after the interview only. Deepgram works live.
- The replay's audio is your microphone; the interviewer's lines appear as
  text in the transcript but aren't in the recording.
- The built-in bank's analyses were written by the maintainers; run
  `npm run problems:analyze -- --all --force` with your own key to
  regenerate them with the strongest model.

## License

MIT. See `LICENSE`.
