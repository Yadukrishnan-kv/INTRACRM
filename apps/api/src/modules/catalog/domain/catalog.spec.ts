import {
  assertStageFlags,
  catalogKindLabel,
  CATALOG_KIND,
  isCatalogCode,
  isProductSku,
  normalizeCatalogCode,
} from './catalog';

describe('catalog codes', () => {
  it('normalizes and accepts tenant catalog codes', () => {
    expect(normalizeCatalogCode('Walk In')).toBe('walk_in');
    expect(isCatalogCode('walk_in')).toBe(true);
    expect(isCatalogCode('Hot')).toBe(true);
    expect(isCatalogCode('months_6')).toBe(true);
    expect(isCatalogCode('1start')).toBe(false);
    expect(isProductSku('INV-12.4')).toBe(true);
    expect(isProductSku(' bad sku')).toBe(false);
  });

  it('rejects a stage that is both won and lost', () => {
    expect(assertStageFlags({ isWon: true, isLost: true }).ok).toBe(false);
    expect(assertStageFlags({ isWon: true }).isOpen).toBe(false);
    expect(assertStageFlags({}).isOpen).toBe(true);
    expect(catalogKindLabel(CATALOG_KIND.leadQualities)).toBe('Lead quality');
  });
});
