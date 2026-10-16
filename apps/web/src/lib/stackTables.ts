/**
 * Copies each column header onto its body/footer cells as `data-label`, so the
 * phone layout in styles.css can show rows as stacked "label: value" cards.
 * Cells spanning several columns (empty states, group headings) get
 * `data-span` instead and render full width.
 */
export function labelTableCells(table: HTMLTableElement): void {
  const head = table.tHead?.rows[0];
  if (!head) return;
  const headers = Array.from(head.cells).map((th) => th.textContent?.trim() ?? '');
  const rows = [...Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)), ...Array.from(table.tFoot?.rows ?? [])];
  for (const row of rows) {
    let col = 0;
    for (const cell of Array.from(row.cells)) {
      if (cell.colSpan > 1) {
        if (!cell.hasAttribute('data-span')) cell.setAttribute('data-span', '');
      } else {
        const label = headers[col] ?? '';
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
      }
      col += cell.colSpan;
    }
  }
}

/** Labels every `.table` under `root` now and whenever rows are added. Returns a cleanup. */
export function observeTables(root: HTMLElement): () => void {
  const run = () => root.querySelectorAll<HTMLTableElement>('table.table').forEach(labelTableCells);
  run();
  // Only childList changes are watched, so setting attributes cannot re-trigger it.
  const observer = new MutationObserver(run);
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
