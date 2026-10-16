import { describe, expect, it } from 'vitest';
import { labelTableCells } from './stackTables';

function table(html: string): HTMLTableElement {
  const el = document.createElement('table');
  el.innerHTML = html;
  return el;
}

describe('labelTableCells', () => {
  it('copies header text onto body and footer cells', () => {
    const t = table(
      '<thead><tr><th>Name</th><th> Total </th><th></th></tr></thead>' +
        '<tbody><tr><td>A</td><td>1</td><td>x</td></tr></tbody>' +
        '<tfoot><tr><td>Sum</td><td>1</td><td></td></tr></tfoot>',
    );
    labelTableCells(t);
    const labels = Array.from(t.querySelectorAll('td')).map((td) => td.getAttribute('data-label'));
    expect(labels).toEqual(['Name', 'Total', '', 'Name', 'Total', '']);
  });

  it('marks spanning cells and keeps later columns aligned', () => {
    const t = table(
      '<thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>' +
        '<tbody><tr><td colspan="3">Empty</td></tr><tr><td colspan="2">AB</td><td>c</td></tr></tbody>',
    );
    labelTableCells(t);
    const cells = t.querySelectorAll('td');
    expect(cells[0]!.hasAttribute('data-span')).toBe(true);
    expect(cells[1]!.hasAttribute('data-span')).toBe(true);
    expect(cells[2]!.getAttribute('data-label')).toBe('C');
  });

  it('does nothing without a header row', () => {
    const t = table('<tbody><tr><td>x</td></tr></tbody>');
    labelTableCells(t);
    expect(t.querySelector('td')!.hasAttribute('data-label')).toBe(false);
  });
});
