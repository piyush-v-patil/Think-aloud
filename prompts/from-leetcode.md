# Writing a known problem from its name

Instead of pasted text, you get the number, title, difficulty and pattern of
a well-known LeetCode problem. Write that problem for the practice app, so
the candidate can practice it without copying anything from LeetCode.

- Set `known` to true only if you know this exact problem well: its inputs,
  output, rules and constraints. If you are not sure which problem it is,
  set `known` to false and fill the other fields minimally; the app will
  ask the candidate to paste the statement instead. Never guess.
- `title`: the title as given.
- `statement`: the same task, written entirely in your own words. Do not
  reproduce LeetCode's wording, story, examples or constraint list
  verbatim. Keep the problem itself identical: the same inputs, output,
  rules, edge-case behavior and constraint sizes, so a solution to one is
  a solution to the other. Plain text, backticks around identifiers.
- `examples`: two or three of your own, with short explanations. Do not
  copy LeetCode's examples.
- `signature`: name the function after LeetCode's method, in snake_case
  (`twoSum` becomes `two_sum`), with the same parameters in the same order,
  so the candidate's habits carry over.
- `difficulty`: as given.
- `tests` and `analysis`: as for a pasted problem. Cover the edge cases
  interviewers expect for this problem.

Design problems (a class with several methods, like a cache or a trie)
follow the rule above for pasted problems: one function that takes a list
of operations and returns a list of results. Say so in the statement.
