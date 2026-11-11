# Problem analysis

You are preparing reference material for a mock coding interview. A
different model will play the interviewer and another will score the
candidate; both rely on what you write here, so be precise and complete.

You receive one coding problem. Produce an analysis with these parts.

## Clarifying questions

The questions a strong candidate asks before solving, each with the answer
the interviewer should give and why asking it matters. Cover input size,
empty or minimal input, duplicates, negative or zero values, ordering,
character sets, and what to return when there is no answer, whichever
apply. Give 3 to 6. Answers must be consistent with the tests.

## Hidden constraints

Facts the interviewer reveals only if the candidate asks (for example
"the list can have up to 100,000 items" or "values fit in 32 bits").

## Edge cases

Inputs that commonly break solutions, each with why. Give 3 to 6.

## Approaches

Every reasonable approach from brute force to optimal: name, the idea in
two or three sentences, time and space complexity in big-O, and the
tradeoff that makes a candidate choose between them.

## Optimal approach

The approach a strong candidate should land on, explained so a
candidate could implement it from the explanation alone.

## Hint ladder

Four or five hints ordered from vague to specific. The first should only
nudge ("What do you need to remember about elements you've already
seen?"). The last can name the technique. Never include code.

## Expected mentions

Things a strong candidate says aloud during the interview, with a stable
short id and the rubric category they show:

- clarification: inputs, edge cases, constraints
- planning: approach and complexity stated before coding
- reasoning: why, including tradeoffs
- narration: explaining code as it is written
- testing: tracing an example aloud, finding bugs
- hint-handling: building on nudges

Include at least: one clarification, the brute-force baseline, the
optimal approach with its time complexity, the space tradeoff, and a
traced example. These become missed-opportunity markers when the
candidate never says them, so each must be specific to this problem.

## Follow-ups

One to three follow-up questions an interviewer could add if time
remains (a changed constraint, a larger input, a streaming version).

## Vocabulary

Technical terms likely to be spoken in this interview (data structures,
algorithm names, complexity terms), used as speech-recognition hints.
Eight to fifteen short terms.

## Reference solution

A correct, clean solution in Python and in JavaScript. Each defines a
top-level function with exactly the name and parameters in the given
signature. Python: a plain function, standard library only. JavaScript: a
plain function declaration, no imports. Both must pass every test.

## Walkthrough

A full think-aloud by a strong candidate, in order, through the phases
clarify, plan, code, test and wrap-up. Each step is what they say aloud,
in the first person, in natural spoken language: short sentences, no
headings, no markdown. Include code written during coding steps. The
walkthrough should model good habits: asking before assuming, stating the
brute force and why it's not enough, naming the complexity before coding,
narrating why rather than reading code aloud, tracing an example, and
catching a mistake. Eight to twelve steps.

Write for a reader under interview stress: plain words, no jokes.
