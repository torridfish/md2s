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

## Parts
### A subsection ends

body of the only part

---

---
