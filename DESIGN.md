# Design plan

This is the design plan for Think Aloud (the name lives in `src/config/app.ts`).
It was written before any interface code, then reviewed against the brief's
"Avoid these" list. The review notes are at the end.

## Concept: the marked-up transcript

A coding interview happens at a whiteboard, and the interviewer walks away with
marked-up notes. The app is that board. The page is a bright board surface, text
is ink, and feedback is marker on the candidate's own words.

The one bold element is the **marked-up transcript**: the quoted words are
underlined in marker directly in the transcript, and the note that explains the
mark hangs in a margin column beside it, joined to the underline by a thin
leader line. A note is never a floating chip. Everything else is quiet: no
cards, no shadows, no badges.

The same transcript-with-margin component is used live (Training mode) and in
the debrief, so the user learns one way of reading feedback.

## Palette

### Light (default)

| Token          | Hex       | Role                                                    | Contrast on board |
|----------------|-----------|---------------------------------------------------------|-------------------|
| `board`        | `#F7F9F8` | Page ground                                             | n/a               |
| `paper`        | `#FFFFFF` | Editor and the selected moment only                     | n/a               |
| `ink`          | `#1B1D22` | Text, the user's own words                              | 15.95:1           |
| `ink-soft`     | `#5A6168` | Secondary text (timestamps, help text)                  | 5.94:1            |
| `blue`         | `#1F4FD8` | Strong signal, primary actions, focus ring              | 6.27:1            |
| `red`          | `#C8322B` | Negative signal                                         | 5.03:1            |
| `green`        | `#0E7A55` | The interviewer's voice, passing tests                  | 5.05:1            |
| `smudge`       | `#D5DBDD` | Rules, inactive states, track backgrounds (never text)  | 1.32:1 (decor)    |
| `smudge-mark`  | `#6F797E` | Missed-opportunity marks and neutral marks              | 4.21:1            |
| `blue-wash`    | `#E4EBFB` | Selected moment background                              | ink 14.1:1        |

### Dark (a setting, designed separately)

The dark theme is a slate chalkboard, not an inversion of the light theme and
not near-black with one accent. The ground has a green cast like a real
board, and all three marker colors stay present, so it never reads as a
single-accent dark dashboard.

| Token          | Hex       | Contrast on board |
|----------------|-----------|-------------------|
| `board`        | `#18201E` | n/a               |
| `paper`        | `#202A27` | n/a               |
| `ink`          | `#E6EBE8` | 13.77:1           |
| `ink-soft`     | `#9AA6A2` | 6.61:1            |
| `blue`         | `#A8C1FF` | 9.28:1            |
| `red`          | `#E8746A` | 5.65:1            |
| `green`        | `#5FD1A0` | 8.79:1            |
| `smudge`       | `#33403C` | decor             |
| `smudge-mark`  | `#7F8C88` | 4.75:1            |
| `blue-wash`    | `#24324A` | ink 10.7:1        |

The Monaco editor gets a matching custom theme in each mode (light editor by
default).

### Meaning never rides on color alone

| Signal              | Color        | Underline shape           | Margin note text            |
|---------------------|--------------|---------------------------|-----------------------------|
| Strong signal       | blue         | solid marker stroke       | starts with `+2` or `+1`    |
| Neutral             | smudge-mark  | thin solid stroke         | starts with `0`             |
| Negative signal     | red          | zigzag stroke             | starts with `-1`            |
| Missed opportunity  | smudge-mark  | dashed stroke             | starts with "Missed:"       |

Blue and red also differ in lightness: in light mode blue has relative
luminance 0.108 and red 0.147; in dark mode 0.537 and 0.307.

## Typefaces

- **Interface: Atkinson Hyperlegible Next** (SIL Open Font License). Designed
  by the Braille Institute so that every letter is distinct: `l`, `I` and `1`
  differ, `0` and `O` differ. Transcripts in this app are full of identifiers,
  numbers and complexity terms read at speed by someone under stress, so
  legibility is the product requirement, not a style. It also has a warm,
  slightly irregular character that suits a board-and-marker concept without
  imitating handwriting.
- **Code and timestamps: Atkinson Hyperlegible Mono** (SIL OFL). The same
  disambiguation rules applied to code, so the editor and transcript
  timestamps share one family voice.

Both are bundled with the app from the `@fontsource` packages and served from
our own origin. No font is loaded from a third-party server.

## Type scale

Five sizes. Hierarchy comes from size and weight only.

| Token   | Size / line height | Weight | Use                                      |
|---------|--------------------|--------|------------------------------------------|
| `xs`    | 13 / 18            | 400    | Timestamps (mono), help text             |
| `sm`    | 15 / 22            | 400    | Body, transcript, margin notes, controls |
| `md`    | 18 / 26            | 600    | Section headings                         |
| `lg`    | 24 / 30            | 700    | Screen titles                            |
| `xl`    | 32 / 38            | 700    | Setup screen opening line only           |

## Spacing scale

4, 8, 12, 16, 24, 32, 48, 64 px (`1, 2, 3, 4, 6, 8, 12, 16` in Tailwind units).
Groups are separated by 32 or 48; items inside a group by 8 to 16.

## Shape

Radius varies by role:

| Role                         | Radius |
|------------------------------|--------|
| Buttons, inputs              | 3px    |
| Editor container             | 6px    |
| Dialogs                      | 10px   |
| The selected moment          | 0 (a 3px left rule instead) |
| Toggles (real on/off switch) | full   |

No drop shadows, gradients or glows. Elevation of a dialog is shown with a
1px ink rule and a dimmed backdrop.

## Motion

One deliberate moment: when a reaction arrives, its underline draws under the
quoted words from left to right, like a marker stroke (SVG `stroke-dashoffset`,
320ms, ease-out). With `prefers-reduced-motion`, the underline appears without
drawing. Nothing else animates on entry; motion only answers a user action.

## Components (built first)

`Button` (primary, secondary, quiet), `TextField`, `TextArea`, `Select`,
`Toggle`, `RadioGroup` (segmented rows with a ruled underline, not pills),
`Rule`, `Dialog`, `MarkedTranscript` (the signature), `MarkerUnderline`,
`MarginNote`, `ScoreTally` (four tick strokes, n filled, plus the digit),
`ImpressionMeter` (slim bar), `Timeline` (marked-up strip), `CostLine`
(amount + currency + "estimate"/"actual").

## Wireframes

### Setup

```
Think Aloud                                    History   Settings
------------------------------------------------------------------
Practice thinking out loud.                     (xl, left-aligned)
A 45 minute mock interview, then a replay of what helped or hurt.

Problem
  ( ) Random from the bank   [Difficulty v] [Topic v]
  ( ) Paste a problem        [ text area                      ]
  ( ) From your list         [ list v ]
  ( ) A variation of one you've done
                                                     ----------
Interviewer                                          Session cost
  Friendly | Neutral | Stone-faced                   about $0.42,
                                                     estimate
Feedback                                             Balanced:
  Training | Delayed | Realistic                     Sonnet live,
  (one line explaining the selected mode)            Opus debrief
Language
  Python | JavaScript
Quality
  Economy | Balanced | Best | Advanced
Length  [45] minutes

[Start interview]   Try the demo session
```

### Interview

```
02:10 / 45:00  Plan                          [End interview]
-------------------------------------------------------------------
Interviewer (green rule)      | editor (paper, 6px radius)
"Sure. Tell me how you'd..."  |  1 def merge(a, b):
[mic state] Listening         |  2   ...
                              |
Transcript          margin    |
02:10 You "Can the  | +2 Clar |
 list be empty"     | ...     |
  ~~~~~~~~~~        |         | [Run tests]   3 of 5 passed
                              | test output (mono)
==== impression meter (slim) ==============================
```

On a phone: one column. Interviewer line, editor, run button, then the
transcript as a bottom drawer. Margin notes move under their utterance,
indented, with a 3px marker-colored left rule.

### Debrief

```
Your interview: Merge intervals                Share card  Export
-------------------------------------------------------------------
Lean yes                         Correctness: 5 of 5 tests passed
Clarification  ||||  3 of 4      "Can the list be empty" 02:10
Planning       |||   2 of 4      ...
...
Session cost $0.38, actual (AI $0.31, speech $0.07)

Replay
[ clarify | plan |   code        | test | wrap ]  <- ruled strip
   |  +    -        ^ missed      +
[play] 02:10 ----------------------------------
code at 02:10 (read-only editor)  |  marked transcript at 02:10

Interviewer's notes
- Asked about empty input before coding (02:10)
...

A stronger version of 11:40
  "What a strong candidate might have said" [Play]
  [Re-record this moment]
```

### History

```
History                                   Spend this month $3.12 actual
-------------------------------------------------------------------
Weakest area: Narration. Try "Rotate matrix" next.  [Start interview]

Trend: one small line chart per rubric category, model changes marked
with a vertical dashed rule labelled with the preset.

Date        Problem          Hire signal  Preset     Session cost
Nov 11      Merge intervals  Lean yes     Balanced   $0.38 actual
```

Empty: "No interviews yet. Watch the demo session to see what the replay
looks like, or start your first interview." with both actions.

## Review against "Avoid these"

What a generic dashboard would have done, and what changed:

1. **Score tiles.** First draft showed each rubric score as a big digit over a
   small label. That is the "big number with a small label" pattern. Changed
   to a ruled table row: category name, a four-stroke tally, "3 of 4", and
   the quoted evidence with its timestamp on the same line. The evidence is
   the point, so it sits next to the score.
2. **Preset pills.** First draft used pill buttons for presets and personas.
   Changed to segmented rows with a ruled underline under the selected item.
   Pills are kept only for the real on/off toggles in settings.
3. **Meta strings.** History rows were "Nov 11 · Balanced · $0.38". Changed to
   real table columns.
4. **Reaction badges.** Reactions as colored chips floating over the
   transcript is the default AI-feedback look and breaks the trust principle.
   Replaced by the underline-plus-margin-note component.
5. **Dark theme.** The quick version was a near-black background with blue
   as the only accent. Replaced by the green-cast slate board where all
   three marker colors keep their meaning.
6. **Section labels.** Removed small uppercase letter-spaced labels above
   headings ("SETUP", "STEP 1"). Headings are sentence case and stand alone.
7. **Cards.** The setup screen was a grid of six rounded cards. Replaced by
   one left-aligned column of groups separated by whitespace and rules, with
   the cost estimate in a narrow right column on wide screens.
8. **Buttons.** No arrows, no "Submit". Every button names its action.
9. **Icons.** No emoji. The few icons (play, mic) are simple inline SVG
   strokes in ink color, always paired with a text label.
