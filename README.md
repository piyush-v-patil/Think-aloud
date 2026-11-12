<div align="center">

# Think Aloud

**A voice mock interview that grades how you think, not just what you type.**

Talk through a coding problem with an AI interviewer, then replay the whole
session and see every moment that helped or hurt, underlined in your own words.

Free · open source · no backend · your key stays in your browser

[Quick start](#quick-start) ·
[Features](#features) ·
[What it costs](#what-a-session-costs) ·
[Privacy](#privacy) ·
[How it works](#how-it-works) ·
[Contributing](CONTRIBUTING.md)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/interview-dark.png">
  <img src="docs/screenshots/interview.png" alt="The interview screen. On the left, the interviewer asks 'Talk me through what you are writing right now', a 'Stuck? You could say' suggestion sits below it, and the live transcript shows a 30 second silence underlined in red with a margin note: '-1 Narration, quiet while writing the lookup loop'. On the right, the problem statement, a Python solution in the editor, and 6 of 6 tests passed." width="100%">
</picture>

</div>

## Why

Coding interviews quietly score your **process**: did you ask clarifying
questions, plan before typing, say why you chose a data structure, test your
own code, take a hint well? Most practice tools only check whether the code
passes. You can solve every problem on a practice site and still lose the
interview by coding in silence.

Think Aloud practices the part those sites can't see. You speak, an
interviewer listens and answers back, and afterwards you get a replay that
points at the exact second you went quiet, guessed, or explained something
well, with what a stronger candidate might have said instead.

## Features

### The marked-up transcript

Feedback is marker on your own words. Each note underlines the exact phrase
it's about and hangs in the margin beside it, with a timestamp. Strong
moments get a solid blue stroke, weak ones a red zigzag, missed
opportunities a dashed gray line, so the meaning never depends on color
alone.

<img src="docs/screenshots/marked-transcript.png" alt="A transcript excerpt from 01:21 to 02:08. The phrases 'compare every pair and merge whenever two overlap', 'quadratic' and 'a booking can only overlap the last one I merged' are underlined in blue marker." width="100%">

### A live interviewer that actually listens

- **Speaks and listens.** The interviewer talks out loud and hears you
  through your microphone. Interrupt it and it stops talking.
- **Knows when to speak.** Code, not the model, decides *when* to reply:
  after you finish a thought, after 30 seconds of silence with no code
  change, after a test run, at a phase change or a time mark. What it says
  is always the model's own words.
- **Three personas.** Friendly, Neutral, or Stone-faced.
- **A shared editor.** Python, JavaScript or Java in a full Monaco editor,
  run in your browser against real tests, including hidden ones. Java is
  compiled in the browser too ([more below](#java-in-the-browser)).
- **"Stuck? You could say".** In Training mode, when you stall, it offers
  one sentence you could say out loud to get moving again.
- **An impression meter** shows how the interviewer reads you so far.

### Three feedback modes

| Mode | When you see feedback |
|---|---|
| **Training** | Live, in the margin, as you talk |
| **Delayed** | At the end of each phase: clarify, plan, code, test, wrap-up |
| **Realistic** | Only in the replay, like a real interview |

### The replay

A timeline of the whole session, split into phases. Blue arrows mark strong
moments, red zigzags weak ones, dotted lines the things you didn't mention,
gray blocks your silences. Click any mark and the editor jumps to your code
at that second, the transcript scrolls to your words, and the recording
plays from there.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/replay-dark.png">
  <img src="docs/screenshots/replay.png" alt="The replay timeline across Clarify, Plan, Code, Test and Wrap-up, with strong, weak and missed marks and gray silence blocks. Below, the code at 05:21 and the selected moment: '-1 Reasoning, I guess the output list, unsure about space', with 'What a strong candidate might have said here', a Play this button and a Re-record this moment button." width="100%">
</picture>

- **What a strong candidate might have said.** Every weak moment comes with
  a better version you can read or hear.
- **Re-record this moment.** Say it again in your own words and get that
  moment rescored.
- **The walkthrough.** Every built-in problem includes a full example of
  thinking aloud, from first questions to wrap-up.

### Scores you can check

Six rubric categories, each scored 1 to 4, plus correctness from your real
test results and an overall signal. Every score quotes what you said, with a
timestamp.

<img src="docs/screenshots/rubric.png" alt="The rubric: Clarification, Planning, Reasoning, Narration, Testing and Hint handling, each with a four-stroke tally, a one-line summary and a quoted piece of evidence with its timestamp." width="100%">

The scoring is built to be trusted:

1. **Code computes what code can count.** Talk-to-silence ratio, longest
   pause, whether you spoke before typing, time per phase. The model gets
   these as facts; it's never asked to count or time anything.
2. **Every quote is checked.** Code looks up each quoted phrase in your
   transcript. A score whose evidence can't be found gets one repair
   attempt, then is dropped.
3. **A second, independent pass reviews it.** A verification call reads
   each judgment against its evidence and can only lower or remove it,
   never raise it.
4. **The accurate transcript wins.** If a more accurate transcript was made
   from your recording after the interview, scoring uses it, and live
   notes are re-checked against it first.

### Progress over time

<img src="docs/screenshots/history.png" alt="The History screen: 'What to work on next: your weakest area lately is narration. Try Balanced trios next.' Below, six small line charts, one per rubric category, each with a dashed vertical line where the AI model or preset changed." width="100%">

- One trend line per rubric category. A dashed line marks where you changed
  model, preset or speech engine, so you know scores on either side aren't
  perfectly comparable.
- **What to work on next** picks your weakest area and a problem that
  exercises it.
- Spend for the week and month, with an optional monthly limit.

### Problems

- **33 original problems** in the built-in bank (10 Easy, 22 Medium, 1
  Hard) across arrays and hashing, two pointers, sliding windows, stacks,
  linked lists, intervals, trees, graphs, heaps, binary search,
  backtracking and dynamic programming. Every one is written
  for this project, with its own scenario and tests, and comes with a
  precomputed analysis: clarifying questions, edge cases, approaches, a hint
  ladder, reference solutions in Python, JavaScript and Java, and the
  walkthrough.
- **Paste any problem.** It's analyzed once, its tests are checked against a
  generated reference solution, and the result is cached on your device.
- **Your problem list.** Keep links to problems you want to practice. It
  sorts them so the ones you scored lowest on come up first.
- **Variations.** Get a fresh twist on a problem you've already done.

### Your keys, your choice of models

- **Bring your own key**: Anthropic (default), OpenAI, Google Gemini, or any
  OpenAI-compatible endpoint (OpenRouter, Ollama, LM Studio).
- **Quality presets**: Economy, Balanced and Best, or pick each model
  yourself.
- **Or use your Claude subscription** through Claude Code on your own
  computer, with no API key. See [below](#use-your-claude-subscription-instead-of-a-key).
- **A live cost estimate** on the setup screen, and the **actual cost** after
  every session, computed from the usage the API reported, cached tokens
  included.

<img src="docs/screenshots/setup.png" alt="The setup screen on one page: 'Practice thinking out loud.', the problem source with difficulty and topic filters and the picked problem, then 'Your interview' as compact rows (interviewer, feedback, language, quality with its models, length), a one-line 'Everything is ready.' status, and the Start interview button with the cost estimate beside it." width="100%">

### Speech your way

| Engine | Live | After the interview | Where your audio goes |
|---|---|---|---|
| Browser speech (default) | Yes | | Your browser's speech service |
| On-device Whisper | | Yes | Nowhere. It runs on your computer |
| Deepgram | Yes | Yes | Deepgram, with your key |
| AssemblyAI | | Yes | AssemblyAI, with your key |
| OpenAI | | Yes | OpenAI, with your key |
| Typing | | | No audio at all |

The problem's own vocabulary is passed as keyword hints, so `heapq` and
`memoize` come through as words, not noise.

### A natural interviewer voice, without the wait

Pick a **Natural** voice in Settings → Speech and the interviewer speaks
with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), a small neural
voice model that runs on your computer, on the graphics card through
WebGPU. It sounds far more human than the voices built into browsers, and
nothing you hear is sent anywhere to be made.

Speed comes first, so it's guarded twice:

- **A speed check on your computer.** The first time, the model is
  downloaded (about 330 MB with WebGPU, 95 MB without) and timed. It's used
  only if your computer makes speech at least 4 times faster than it's
  spoken; otherwise the interview keeps the fast built-in voice, and
  Settings says so.
- **A deadline for every reply.** If a reply's first sentence isn't ready in
  0.9 seconds, the whole reply is spoken by the fast voice instead (never
  half and half). Later sentences are made while earlier ones play.

Pronunciation comes from the CMU Pronouncing Dictionary rather than eSpeak
(which is GPL), with the unstressed small words of natural speech ("happens
*tə* the") and the way people read code aloud (`O(n log n)` is "O of n log
n", `merge_bookings` is "merge bookings"). A round trip through Whisper
understood it as well as eSpeak's version.

Prefer a voice built into your browser? The list marks which ones run on
your computer (start at once) and which are online (can start slowly).

### Also

- **A dark theme** designed on its own: a slate chalkboard where all three
  marker colors keep their meaning.
- **Works on a phone.** One column, with margin notes moving under the line
  they're about.
- **A share card**: an image of your scores and overall signal, made on your
  device, with no name, transcript or code.
- **Export and import** everything (never keys), or delete it all.
- **A demo session** you can open without a key.
- **A "Getting ready" panel** on the setup screen. It starts loading what
  your choices need (the Python or Java runner, the natural voice) and shows
  progress, checks the microphone and the AI connection (including whether
  the Claude Code bridge is running), and says what to do about anything
  that isn't ready. Loading continues in the background if you start early.

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/phone-transcript.png" alt="The marked-up transcript on a phone in the dark theme, with margin notes under each line."></td>
    <td width="33%"><img src="docs/screenshots/phone-summary.png" alt="The replay summary on a phone in the dark theme: overall signal Lean yes, 6 of 6 tests passed, and the session cost of $0.35, actual."></td>
    <td width="33%"><img src="docs/screenshots/replay-summary.png" alt="The replay summary on desktop: overall signal, correctness, session cost broken down by role, and the first rubric rows with quoted evidence."></td>
  </tr>
</table>

## Quick start

```bash
git clone https://github.com/piyush-v-patil/think-aloud.git
cd think-aloud
npm install        # also copies Pyodide and ONNX Runtime into public/vendor
npm run dev        # http://localhost:5173
```

Open the app and watch the **demo session** (no key needed). Then add a key
in **Settings** and start an interview. Headphones help: the interviewer
won't hear its own voice.

### Getting an AI key

1. Create an account with a provider. Anthropic is the default:
   <https://platform.claude.com/settings/keys>.
2. Add a little credit. $5 covers many sessions.
3. Paste the key in **Settings** and choose whether to remember it on this
   device or for this session only. **Save and check key** sends one tiny
   request to confirm it works and has credit.

### Use your Claude subscription instead of a key

If you have [Claude Code](https://code.claude.com/docs/en/setup) installed
and signed in, Think Aloud can use it instead of an API key. Usage counts
against your Claude plan's limits. This is meant for your own practice with
your own account.

The app can't start programs on your computer, so a small bridge does it.
Get the bridge one of two ways:

- **Using the hosted site** (<https://piyush-v-patil.github.io/Think-aloud/>)?
  You don't need the whole project. Download the single file
  [`scripts/claude-bridge.mjs`](https://github.com/piyush-v-patil/think-aloud/blob/main/scripts/claude-bridge.mjs)
  from this repository, and run it with Node.js 18 or later:

  ```bash
  node claude-bridge.mjs --origin https://piyush-v-patil.github.io
  ```

- **Running the app yourself** from a clone of
  [this repository](https://github.com/piyush-v-patil/think-aloud):

  ```bash
  npm run claude-bridge
  ```

The bridge starts on `http://localhost:8787` and prints a bridge token. In
**Settings → AI provider**, choose **Claude Code**, paste the token, and
press **Save and check key**. Keep the terminal open while you practice.
Settings shows the exact command for the site you're on, with links to the
file and the repository. From the hosted site, your browser may ask for
permission to connect to devices on your local network.

<img src="docs/screenshots/claude-code.png" alt="Settings with Claude Code chosen as the AI provider: four setup steps with a link to download the bridge file and to the project on GitHub, the commands to run it, the bridge address and the bridge token, with 'Key saved. It works.'" width="560">

How the bridge stays safe and private:

- It listens on `127.0.0.1` only, needs the token on every request, and
  refuses web pages from sites other than this app's.
- Each `claude -p` process runs with no tools, no MCP servers, no hooks,
  no slash commands, no `CLAUDE.md` files and no saved session, in an empty
  temporary folder. Prompts and replies are never logged.
- The token is saved in `~/.config/think-aloud/bridge-token`.
  `npm run claude-bridge -- --new-token` replaces it, `--port` changes the
  port, and `--origin` allows another site.

The bridge is built for a live conversation:

- **It keeps Claude Code running.** Each conversation (the interviewer, the
  live feedback) stays in one running `claude` process, and later turns
  send only the new message. The first word of a reply arrives in about
  1.2 seconds, against about 2.4 seconds when starting `claude` each time.
- **It keeps a warm spare.** If the conversation can't continue (say you
  interrupted the interviewer, so its last reply was dropped), a spare
  process that's already started takes over.
- **It answers as soon as the reply ends.** Claude Code can do some
  follow-up work of its own after a reply; the bridge doesn't wait for it.
- Idle processes close after 10 minutes, and all of them close when you
  stop the bridge.

The cost panel shows tokens instead of dollars.

## What a session costs

You pay your AI provider directly. Estimates for a 45 minute interview in
Training mode (live feedback), with prices checked on 2026-11-11:

| Provider  | Economy | Balanced (default) | Best   |
|-----------|---------|--------------------|--------|
| Anthropic | $0.03   | $0.72              | $1.44  |
| OpenAI    | $0.03   | $1.15              | $3.37  |
| Gemini    | $0.13   | $0.33              | $0.56  |

- Realistic mode costs a little less. Preparing a pasted problem adds a
  one-time cost.
- Gemini's listed prices for its larger models double on 2026-12-01 and
  2027-01-01; the app switches automatically.
- Speech is free with the browser engine or on-device Whisper. Paid speech
  engines cost roughly $0.20 to $0.45 per 45 minute interview.
- Tokens aren't wasted: prompts are split so the stable part (rules, problem,
  analysis, earlier transcript) is cached, and only your newest turn costs
  full price.
- After three sessions, the estimate uses your own averages.

## Privacy

<img src="docs/screenshots/privacy.png" alt="The privacy section of Settings, describing in plain words what leaves the device for the current choices." width="100%">

There is no server of ours. Nothing you do here is sent to the people who
made this app: no keys, recordings, transcripts or usage data. There is no
analytics or tracking, and fonts and runtimes are served from the app's own
origin.

What leaves your device:

- **Text to your AI provider** (the one you choose): the problem, your
  transcript, your code, test results and timing, so the interviewer can
  reply and your feedback can be written. Your key is sent only to that
  provider. (On Google's free tier, Google may use prompts to improve its
  products; on its paid tier it does not.) With Claude Code, the text goes
  to the bridge on your computer and from there to Anthropic.
- **Audio, depending on the speech engine you choose:**
  - Browser speech recognition (the default): your voice goes to your
    browser's speech service (Google for Chrome and Edge, Apple for
    Safari).
  - On-device Whisper: nowhere. The speech model is downloaded from Hugging
    Face the first time; none of your data is sent with that download.
- **The interviewer's words, to be spoken:** nowhere with a natural voice or
  a voice that runs on your computer. An online browser voice (such as
  Chrome's "Google" voices) sends them to your browser's voice service.
  - A paid engine (Deepgram, AssemblyAI or OpenAI): your audio goes to the
    engine you chose, using your key.
  - Typing instead of speaking: no audio at all.

Everything else stays in your browser's storage: recordings, sessions, your
problem list, settings, and keys if you chose to remember them. **Settings →
Your data** exports everything (never keys), imports it, or deletes it. The
Settings screen shows this statement for your current choices.

## Browser support

- **Voice**: Chrome, Edge and Safari. In Firefox, or if the microphone is
  blocked, you type what you'd say instead.
- **Everything else** (editor, running code, replay): any current browser.
- **On-device Whisper** needs a recent computer. It uses WebGPU when
  available and WebAssembly otherwise.

## How it works

A fully static Vite + React + TypeScript + Tailwind site. No server code.

```mermaid
flowchart LR
  subgraph Browser["Your browser"]
    Mic["Microphone"] --> STT["Speech to text"]
    STT --> Turns["Turn-taking<br/>(code decides when to reply)"]
    Editor["Monaco editor"] --> Runner["Pyodide / JS<br/>in locked-down workers"]
    Runner --> Turns
    Turns --> Log["Session log<br/>(one clock)"]
    Log --> Store[("IndexedDB")]
  end
  Turns <--> AI["Your AI provider<br/>(your key)"]
  Log --> Score["Scoring → evidence check<br/>→ verification"]
  Score <--> AI
  Score --> Replay["Replay"]
```

1. **Setup.** Built-in problems come with a precomputed analysis, so they
   need no analysis call. Pasted problems and variations are analyzed once
   with the strongest model in your preset and cached by their text.
2. **Interview.** Everything is stamped on one session clock: speech, code
   snapshots, test runs and the recording. Static code decides when to ask
   the model; the model decides what to say.
3. **Feedback.** Timing metrics are computed in code and passed to the model
   as inputs. Training shows reactions live, Delayed at each phase change,
   Realistic only in the replay.
4. **Replay.** A scoring call reads the transcript, code history, real test
   results and the analysis. Code checks every quote, a repair call fixes
   what it can, and an independent verification call removes or lowers
   anything the evidence doesn't support.

```
prompts/              every prompt, as readable Markdown
problems/             the built-in bank: one JSON file per problem
schema/               generated JSON Schema for problem files
scripts/              maintainer scripts, and the Claude Code bridge
src/config/           app name, CSP, models and prices, speech engines, usage model
src/copy/strings.ts   all interface text, in one place
src/lib/ai/           provider interface and adapters (Anthropic, OpenAI, Gemini, compatible)
src/lib/speech/       speech-to-text engines, turn-taking, alignment, Whisper
src/lib/voice/        the interviewer's voice: browser voices, Kokoro, pronunciation
src/lib/runner/       sandboxed code runner (Pyodide, JS and Java on TeaVM, in Web Workers)
vendor/teavm/         the in-browser Java compiler, with its sources and licenses
src/lib/interview/    the interviewer and the event log it reads
src/lib/feedback/     metrics, reactions, scoring, evidence checks, verification
src/lib/session/      the live interview controller and post-session processing
src/lib/replay/       timeline sync
src/ui/, src/screens/ components and screens
```

[DESIGN.md](DESIGN.md) explains the visual design: the marked-up transcript
concept, the palette, the typefaces (Atkinson Hyperlegible Next and Mono,
chosen so `l`, `I` and `1` never blur together), and a review of every
screen.

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

## Development

```bash
npm test                         # unit and integration tests
npm run lint && npm run typecheck
npm run problems:validate        # problem JSON schema
npm run problems:check-solutions # every reference solution, all three languages
npm run build                    # static site in dist/
```

CI runs all of these on every pull request.

### Updating models and prices

Models and prices change. Each provider has one file:

- `src/config/providers/anthropic.ts`, `openai.ts`, `gemini.ts`: model ids,
  prices per million tokens (input, output, cache read, cache write),
  dated price changes, and the Economy, Balanced and Best presets.
- `src/config/speech.ts`: speech engine models and per-minute prices.
- `src/config/usageModel.ts`: the token-usage assumptions behind the cost
  estimate before you have history.

Each file notes the date its prices were checked and the pricing page.
`npm test` checks that presets stay ordered by cost.

### Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main` (enable Pages with "GitHub Actions" as the source). The build
is a plain static site in `dist/` that works on any static host. It uses
relative paths and hash routing, so no server configuration is needed.

### Java in the browser

Java code is compiled and run on your device, like Python and JavaScript.
The compiler is [TeaVM's in-browser javac](https://github.com/konsoletyper/teavm-javac):
OpenJDK's `javac` and TeaVM in one WebAssembly module (about 6.5 MB, served
from this site). It turns your code into a small WebAssembly program, and
each test runs on a fresh copy of it, so one crashing test can't affect the
next.

- **Fast after the first run.** The first run loads the compiler (about 2
  seconds); after that a run takes well under a second.
- **Write it like an interview platform.** A `class Solution` with a
  camelCase method (`merge_bookings` becomes `mergeBookings`); `java.util`,
  `java.util.function` and `java.util.stream` are already imported, and
  `ListNode` and `TreeNode` are already defined. Return whatever's natural:
  `int[][]` or `List<List<Integer>>` both work.
- **The real Java API.** `javac` compiles against the JDK's own API
  signatures (`vendor/teavm/java-api.bin`, built from a JDK by
  `scripts/build-java-api.mjs`) instead of the incomplete one TeaVM ships,
  so `Map.Entry`, `getMessage()` and friends work.
- **Checked against a real JDK.** 95 of 102 everyday interview snippets
  (collections, streams, `TreeMap` navigation, records, `switch`
  expressions...) printed exactly what JDK 21 prints. Of the rest,
  `Integer::sum`, `Long::sum` and `Collectors.counting()` are rewritten to
  equivalents in the compiled copy (your code isn't touched), and the
  others are listed under Known limits. CI runs every Java reference
  solution on both TeaVM and a JDK.

## Known limits

- OpenAI live transcription needs a WebRTC session, and AssemblyAI live
  transcription needs a server-issued token, so those two engines are used
  after the interview only. Deepgram works live.
- With Claude Code, the first reply of an interview takes 2 to 3 seconds
  while `claude` starts.
- The natural voice's speed was measured only without a graphics card
  (about 0.4 times real time in a browser, 1.3 times in Node), where the
  speed check rightly keeps the fast voice. On a WebGPU graphics card,
  Kokoro is usually many times faster than real time, but that path hasn't
  been timed in this project yet; the speed check decides on your computer.
- Java runs on TeaVM's class library, which covers almost everything
  interview code uses. Known gaps: `String.format` with `%f` stops the
  program, `.clone()` of an array written as a literal in the same method
  fails (`Arrays.copyOf` works), and an `ArrayIndexOutOfBoundsException` or
  `NullPointerException` can't be caught by your own `try`/`catch` (it
  still shows as the test's error, by name).
- The replay's audio is your microphone; the interviewer's lines appear as
  text in the transcript but aren't in the recording.
- The built-in bank's analyses were written by the maintainers. Run
  `npm run problems:analyze -- --all --force` with your own key to
  regenerate them with the strongest model.

## Contributing

Problems, prompts, providers and speech engines are all designed to be
added. [CONTRIBUTING.md](CONTRIBUTING.md) covers each one. The one hard rule
for problems: write them yourself. This repository never contains text from
LeetCode or any other site.

The app name is a working name. It lives in one place, `src/config/app.ts`.

## Credits

- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad, and its
  [ONNX conversion](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
  (Apache-2.0), for the natural voice. Downloaded at run time, not stored
  in this repository.
- The [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict)
  (BSD-2-Clause), through
  [cmu-pronouncing-dictionary](https://github.com/words/cmu-pronouncing-dictionary)
  (ISC), for pronunciation.
- [TeaVM](https://teavm.org) and
  [teavm-javac](https://github.com/konsoletyper/teavm-javac) by Alexey
  Andreev (Apache-2.0), with OpenJDK's `javac` and API signatures (GPLv2
  with the Classpath Exception), for Java. See `vendor/teavm/README.md`.
- [Transformers.js](https://github.com/huggingface/transformers.js) and ONNX
  Runtime Web (Apache-2.0, MIT), [Pyodide](https://pyodide.org) (MPL-2.0),
  [Monaco](https://github.com/microsoft/monaco-editor) (MIT), and the
  Atkinson Hyperlegible fonts (SIL OFL).

## License

MIT. See [LICENSE](LICENSE).
