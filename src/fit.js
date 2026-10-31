// In every deck (PDF, PPTX, HTML, and the layout check's page): a table wider than its box, its longest words
// already whole (overflow-wrap: break-word), gets a smaller font, step by step down to MIN, until it fits; as a
// code block does when its longest line would not. One that still does not fit at MIN keeps MIN, and the layout
// check names it.
(() => {
  const MIN = 6;   // px: smaller is not read
  const fit = () => {
    for (const t of document.querySelectorAll('section table')) {
      // a slide the HTML deck is not showing is not laid out: it is fitted when it is shown
      if (!t.getClientRects().length || t.dataset.md2sFit === document.fonts?.status) continue;
      t.style.fontSize = '';
      const box = t.closest('.area, .body') || t.parentElement;
      const cs = getComputedStyle(box);
      let avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // a table right in a layout's grid (no ::: area around it) has its grid column for a box
      if (cs.display === 'grid') {
        const item = t.parentElement === box ? t : t.closest('.captioned');
        const tracks = cs.gridTemplateColumns.split(' ').map(parseFloat), gap = parseFloat(cs.columnGap) || 0;
        const x = item.offsetLeft - (item.offsetParent === box ? 0 : box.offsetLeft + box.clientLeft) - parseFloat(cs.paddingLeft) - parseFloat(getComputedStyle(item).marginLeft);
        let start = 0;
        for (const w of tracks) {
          if (x < start + w + gap / 2) { avail = w; break; }
          start += w + gap;
        }
      }
      const fits = () => t.offsetWidth <= avail;
      if (!t.offsetWidth) continue;
      t.dataset.md2sFit = document.fonts?.status;
      if (fits()) continue;
      let lo = MIN, hi = parseFloat(getComputedStyle(t).fontSize);
      t.style.fontSize = `${lo}px`;
      if (!fits()) continue;
      while (hi - lo > 0.1) {
        const mid = (lo + hi) / 2;
        t.style.fontSize = `${mid}px`;
        if (fits()) lo = mid; else hi = mid;
      }
      t.style.fontSize = `${Math.floor(lo * 10) / 10}px`;
    }
  };
  fit();
  document.fonts?.ready.then(fit);
  window.addEventListener('load', fit);
  // the HTML deck shows one slide at a time: fit a slide's tables when it becomes the shown one
  new MutationObserver(() => requestAnimationFrame(fit)).observe(document.body, { subtree: true, attributeFilter: ['class'] });
})();
