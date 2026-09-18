import { wholeQuantity } from './whole-quantity';

describe('wholeQuantity', () => {
  it('keeps whole units and rounds leftover decimals', () => {
    expect(wholeQuantity(2)).toBe(2);
    expect(wholeQuantity(0.9901)).toBe(1);
    expect(wholeQuantity('3')).toBe(3);
    expect(wholeQuantity(null)).toBe(1);
  });
});
