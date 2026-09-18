import {
  isTimelineCatalogEvent,
  TIMELINE_CATALOG,
  TIMELINE_EVENT,
  titleForEvent,
} from './timeline-events';

describe('timeline events', () => {
  it('covers the tracked catalog events', () => {
    expect(TIMELINE_CATALOG.map((item) => item.code)).toEqual([
      TIMELINE_EVENT.leadCreated,
      TIMELINE_EVENT.leadUpdated,
      TIMELINE_EVENT.statusChanged,
      TIMELINE_EVENT.followUpAdded,
      TIMELINE_EVENT.quotationSent,
      TIMELINE_EVENT.siteVisitAdded,
      TIMELINE_EVENT.warrantyIssued,
      TIMELINE_EVENT.callStarted,
      TIMELINE_EVENT.whatsappSent,
      TIMELINE_EVENT.smsSent,
      TIMELINE_EVENT.customerSynced,
      TIMELINE_EVENT.invoiceSynced,
      TIMELINE_EVENT.paymentReceived,
    ]);
  });

  it('resolves titles and rejects unknown codes', () => {
    expect(titleForEvent('status_changed')).toBe('Status Changed');
    expect(titleForEvent('note', 'Note')).toBe('Note');
    expect(isTimelineCatalogEvent('quotation_sent')).toBe(true);
    expect(isTimelineCatalogEvent('system')).toBe(false);
  });
});
