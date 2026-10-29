---

## Start
### A deck whose first line is --- but has no front matter

npm test: test/smoke.js reads this deck. It has no headingDivider, so the ## below does not start a slide.

| a | b |
| --- | --- |
| 1 | 2 |

## Second
### A heading further down the slide
