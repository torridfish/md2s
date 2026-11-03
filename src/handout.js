#!/usr/bin/env node
// md2s's handout (run by bin/md2s.js after a build): the deck's vector PDF — one landscape page per slide,
// 720 x 405 pt out of Marp, but read off the file, never assumed — tiled onto A4 portrait sheets: 2-up
// stacks two slides, 4-up lays a 2 x 2 grid. Each slide is scaled to fit its cell (36 pt margins, 18 pt
// between cells), centered in it and framed 0.5 pt gray; a short last sheet keeps its cells empty.
// embedPage keeps the slides vector, and the source's Title / Author metadata carries over.
//
//   node src/handout.js deck.pdf deck-handout.pdf [2|4]
'use strict';
const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');

const A4 = [595.28, 841.89];   // pt, portrait
const MARGIN = 36;             // pt, sheet edge to the cells
const GAP = 18;                // pt, between cells
const FRAME = rgb(0.5, 0.5, 0.5);

// tiles `input`'s pages onto A4 sheets, `up` (2 or 4) to a sheet; returns the sheets written
async function handout(input, output, up = 2) {
  if (up !== 2 && up !== 4) throw new Error(`2 or 4 slides to a sheet, not ${up}`);
  const src = await PDFDocument.load(await fs.promises.readFile(input));
  const out = await PDFDocument.create();
  const slides = [];
  for (const page of src.getPages()) slides.push(await out.embedPage(page));
  if (!slides.length) throw new Error(`no pages in ${input}`);

  const cols = up / 2, rows = 2;   // 2-up stacks two slides, 4-up is a 2 x 2 grid
  const cellW = (A4[0] - 2 * MARGIN - (cols - 1) * GAP) / cols;
  const cellH = (A4[1] - 2 * MARGIN - (rows - 1) * GAP) / rows;
  for (let first = 0; first < slides.length; first += up) {
    const sheet = out.addPage(A4);
    for (let j = 0; j < up && first + j < slides.length; j++) {
      const slide = slides[first + j];
      const col = j % cols, row = Math.floor(j / cols);
      const cellX = MARGIN + col * (cellW + GAP);
      const cellY = A4[1] - MARGIN - cellH - row * (cellH + GAP);   // cells counted from the sheet's top
      const { width, height } = slide.size();
      const scale = Math.min(cellW / width, cellH / height);        // fit the cell, keep the aspect
      const w = width * scale, h = height * scale;
      const x = cellX + (cellW - w) / 2, y = cellY + (cellH - h) / 2;   // centered in the cell
      sheet.drawPage(slide, { x, y, width: w, height: h });
      sheet.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.5, borderColor: FRAME });
    }
  }
  const title = src.getTitle(), author = src.getAuthor();
  if (title) out.setTitle(title);
  if (author) out.setAuthor(author);
  await fs.promises.writeFile(output, await out.save());
  return out.getPageCount();
}

if (require.main === module) {
  const [input, output, up = '2'] = process.argv.slice(2);
  if (!input || !output || !['2', '4'].includes(up)) {
    console.error('usage: node src/handout.js input.pdf output.pdf [2|4]');
    process.exit(2);
  }
  handout(input, output, Number(up)).catch((e) => { console.error(`md2s: handout failed: ${String(e.message).split('\n')[0]}`); process.exit(1); });
}

module.exports = { handout };
