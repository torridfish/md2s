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
### A long token with nowhere to wrap

datamix=alpha.json,bravo.json,charlie.json,delta.json,echo.json,foxtrot.json,golf.json,hotel.json,india.json,juliet.json,kilo.json,lima.json,mike.json,november.json,oscar.json

## Wide
### A table wider than the slide

| Method | Venue | ScanRefer-Acc@0.25 | ScanRefer-Acc@0.5 | Multi3DRefer-F1@0.25 | Multi3DRefer-F1@0.5 | Scan2Cap-CIDEr@0.5 | Scan2Cap-B-4@0.5 | ScanQA-CIDEr | ScanQA-B-4 | SQA3D-EM | SQA3D-EM-R |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FirstColumnWord | ICML'24 | 48.6 | 44.0 | 44.7 | 40.6 | 70.2 | 35.0 | 75.9 | 13.2 | 54.6 | LastColumnWord |

## Two lines: a title long enough to wrap onto a second line, which fits and draws no warning at all
### Subtitle

- body

## Three lines: a title that keeps going well past two lines of twenty-four point Times, because some converted PowerPoint titles are whole paragraphs of text
### Subtitle

- body
