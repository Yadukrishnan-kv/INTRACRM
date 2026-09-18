import {
  cell,
  fileNameFor,
  isExportFormat,
  mimeTypeFor,
  percent,
  rupees,
  titleCase,
  ExportDocument,
} from './export-types';
import { csvEscape, renderCsv } from './export-csv';
import { renderXlsx } from './export-xlsx';
import { renderPdf } from './export-pdf';
import { formatYmd, startOfNextZonedDay, startOfZonedDay, zonedLocalToUtc } from '../../tasks/domain/zoned-day';
import { lifecycleForStage, DEFAULT_PIPELINE_STAGES } from '../../pipeline/domain/default-pipeline';
import { PRODUCT_ROLE_CODES, ROLE_CODE_RULE, SYSTEM_ROLE } from '../../identity/domain/system-roles';
import { PinoLogger } from '../../../common/logging/pino-logger';
import { requestContextStorage } from '../../../common/http/request-context';

const doc: ExportDocument = {
  title: 'Leads',
  fileStem: 'leads',
  generatedAt: '2026-01-01T00:00:00.000Z',
  tables: [
    {
      name: 'Leads',
      headers: ['Name', 'City'],
      rows: [['Acme, Inc', 'Pune'], ['"Quoted"', 'Mumbai']],
    },
  ],
};

describe('export helpers', () => {
  it('formats cells, money, percents, and filenames', () => {
    expect(isExportFormat('csv')).toBe(true);
    expect(isExportFormat('exe')).toBe(false);
    expect(mimeTypeFor('csv')).toContain('csv');
    expect(mimeTypeFor('xlsx')).toContain('spreadsheet');
    expect(mimeTypeFor('pdf')).toContain('pdf');
    expect(fileNameFor('leads', 'xlsx')).toBe('leads.xlsx');
    expect(rupees(12345)).toBe('123.45');
    expect(percent(2500)).toBe('25%');
    expect(percent(null)).toBe('');
    expect(titleCase('lead_status')).toBe('Lead Status');
    expect(cell(null)).toBe('');
    expect(cell(3)).toBe('3');
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('renders csv, xlsx, and pdf buffers', async () => {
    const csv = renderCsv(doc).toString('utf8');
    expect(csv).toContain('Leads');
    const xlsx = await renderXlsx(doc);
    expect(xlsx.length).toBeGreaterThan(10);
    const pdf = await renderPdf(doc);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('zoned-day', () => {
  it('formats and converts Asia/Kolkata midnights', () => {
    const utc = zonedLocalToUtc('2026-08-17', 0, 0, 0, 'Asia/Kolkata');
    expect(formatYmd(utc, 'Asia/Kolkata')).toBe('2026-08-17');
    expect(startOfNextZonedDay(startOfZonedDay(utc, 'Asia/Kolkata'), 'Asia/Kolkata').getTime()).toBeGreaterThan(
      utc.getTime(),
    );
  });
});

describe('pipeline defaults', () => {
  it('maps stage flags to lifecycle', () => {
    expect(DEFAULT_PIPELINE_STAGES.length).toBe(8);
    expect(lifecycleForStage({ isWon: true, isLost: false })).toBe('won');
    expect(lifecycleForStage({ isWon: false, isLost: true })).toBe('lost');
    expect(lifecycleForStage({ isWon: false, isLost: false })).toBe('open');
  });
});

describe('system roles', () => {
  it('exposes product role codes', () => {
    expect(PRODUCT_ROLE_CODES).toContain(SYSTEM_ROLE.founder);
    expect(ROLE_CODE_RULE.test('custom.role')).toBe(true);
    expect(ROLE_CODE_RULE.test('Bad Role')).toBe(false);
  });
});

describe('PinoLogger levels', () => {
  it('logs with and without request context', () => {
    const logger = new PinoLogger({ name: 'test', env: 'test', level: 'silent', pretty: false });
    logger.log('info', 'ctx');
    logger.warn('warn');
    logger.error('err', new Error('boom'));
    logger.debug?.('debug');
    logger.verbose?.('trace');
    logger.fatal?.('fatal');
    requestContextStorage.run({ requestId: 'r', path: '/', method: 'GET', tenantId: 't', userId: 'u' }, () => {
      logger.log('with-context');
    });
  });
});
