---
marp: true
headingDivider: 2
---

<!-- npm test: test/smoke.js reads the HTML of this deck; each slide is one case -->

## Tables
### Two tables one blank line apart stay two tables

| a | b |
| --- | --- |
| 1 | 2 |

| c | d |
| :-- | --: |
| 3 | 4 |

## Tables
### An empty header row is no header

|  |  |
| --- | --- |
| first-row-stays | x |

## Tables
### A Role column of data is kept

| Role | Acc |
| --- | --- |
| planner | 51.2 |

## Tables
### A role column under a grouped header

| role | K | Baseline | OOD ||
| x | ^^ | ^^ | SVAMP | MultiArith |
| --- | --- | --- | --- | --- |
| ref | - | no-CoT SFT | 44.7 | 65.6 |
| x | 8 | grouped-x-row | 31.2 | 56.7 |
| b | 8 | matched no-CoT | 31.2 | 56.7 |

## Text
### Braces that are not attributes stay text

User: hello {Task query}

- a bullet ending in braces {Task response}

## Tables
### Best and second on a bold cell mark the cell

| Method | Acc |
| --- | --- |
| Ours | **best-on-bold**{.best} |
| Base | *second-on-italic*{.second} |

## Tables
### A row of only {.sep} rules off the row under it

| A | B |
| --- | --- |
| merged-down | 1 |
| {.sep} |
| ^^ | under-the-rule |
| c | 3 |

## Tables
### A class row of its own under the table styles it

| Method | Acc |
| :-- | --: |
| booktabs-row | 1 |
| Base | 2 |

| {.booktabs} |

## Tables
### Settings centres short columns whatever the colons say

| Split | Run | Accuracy |
| :-- | --: | --: |
| settings-colons | 1 | 68.9 |
| test | 2 | 61.2 |

{.settings}

## Tables
### Settings finds columns past a ^^

| Dataset | Run | settings-caret |
| --- | --- | --- |
| A | 1 | 68.9 |
| ^^ | 2 | 61.2 |
| C | 3 | 55.1 |

{.settings}

## Tables
### A row wider than the header is warned about

| A | B |
| --- | --- |
| ragged-row | 2 | 3 | 4 |
| 5 | 6 |

## Tables
### A caption on the line above the table

[caption-above-the-table]
| A | B |
| --- | --- |
| 1 | 2 |

## Parts
### A subsection ends

body of the only part

---

---
