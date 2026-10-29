---
marp: true
headingDivider: 2
---

<!-- npm test: each slide is one case of the layout check; test/smoke.js lists the warning each must give -->

## Fits
### A full slide that still fits draws no warning

- one
- two
- three

## Tall
### A body taller than its box

- line 01
- line 02
- line 03
- line 04
- line 05
- line 06
- line 07
- line 08
- line 09
- line 10
- line 11
- line 12
- line 13
- line 14
- line 15
- line 16
- line 17
- line 18
- line 19
- line 20
- line 21
- line 22
- line 23
- line 24 is the last one, and the slide cuts it off

## Token
### A long token breaks onto the next line and draws no warning

datamix=alpha.json,bravo.json,charlie.json,delta.json,echo.json,foxtrot.json,golf.json,hotel.json,india.json,juliet.json,kilo.json,lima.json,mike.json,november.json,oscar.json

## Wide
### A table too wide for the slide wraps its cells and draws no warning

| Method | Venue | ScanRefer-Acc@0.25 | ScanRefer-Acc@0.5 | Multi3DRefer-F1@0.25 | Multi3DRefer-F1@0.5 | Scan2Cap-CIDEr@0.5 | Scan2Cap-B-4@0.5 | ScanQA-CIDEr | ScanQA-B-4 | SQA3D-EM | SQA3D-EM-R |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FirstColumnWord | ICML'24 | 48.6 | 44.0 | 44.7 | 40.6 | 70.2 | 35.0 | 75.9 | 13.2 | 54.6 | LastColumnWord |

## Formula
### A display formula cannot wrap, and runs off the slide

$$
\mathcal L = a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 + a_9 + a_{10} + a_{11} + a_{12} + a_{13} + a_{14} + a_{15} + a_{16} + a_{17} + a_{18} + a_{19} + a_{20} + a_{21} + a_{22} + a_{23} + \mathrm{last}
$$

## Two lines: a title long enough to wrap onto a second line, which fits and draws no warning at all
### Subtitle

- body

## Three lines: a title that keeps going well past two lines of twenty-four point Times, because some converted PowerPoint titles are whole paragraphs of text
### Subtitle

- body
