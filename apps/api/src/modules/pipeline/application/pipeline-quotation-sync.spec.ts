import { PipelineService } from './pipeline.service';

const actor = { userId: 'u-1', tenantId: 't-1', membershipId: 'm-1' } as never;

const STAGES = [
  { id: 's-new', code: 'new', name: 'New', sortOrder: 10, isWon: false, isLost: false },
  { id: 's-quote', code: 'quotation', name: 'Quotation', sortOrder: 50, isWon: false, isLost: false },
  { id: 's-neg', code: 'negotiation', name: 'Negotiation', sortOrder: 60, isWon: false, isLost: false },
  { id: 's-won', code: 'won', name: 'Won', sortOrder: 70, isWon: true, isLost: false },
  { id: 's-lost', code: 'lost', name: 'Lost', sortOrder: 80, isWon: false, isLost: true },
];

function leadRow(stageCode: string, lifecycleStatus = 'open') {
  const stage = STAGES.find((s) => s.code === stageCode)!;
  return {
    id: 'lead-1',
    tenantId: 't-1',
    leadNumber: 'LD-1',
    title: 'Windows',
    customerName: 'Mahesh',
    primaryPhone: null,
    quality: null,
    estimatedValueMinor: null,
    currency: 'INR',
    ownerMembershipId: null,
    owner: null,
    pipelineId: 'p-1',
    stageId: stage.id,
    stage,
    lifecycleStatus,
    lostReasonId: null,
    version: 3,
    updatedAt: new Date(),
  };
}

function makeTx(lead: ReturnType<typeof leadRow>) {
  return {
    lead: {
      findFirst: jest.fn().mockResolvedValue(lead),
      update: jest.fn().mockImplementation(({ data }) => ({
        ...lead,
        stageId: data.stageId,
        stage: STAGES.find((s) => s.id === data.stageId),
      })),
    },
    pipelineStage: { findMany: jest.fn().mockResolvedValue(STAGES) },
    leadStageChange: { create: jest.fn() },
    quotation: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  };
}

function makeService(prisma: unknown = {}) {
  const timeline = { record: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new PipelineService(prisma as never, {} as never, timeline as never, audit as never);
  return { service, timeline, audit };
}

const input = (quotationStatus: string) => ({
  tenantId: 't-1',
  leadId: 'lead-1',
  quotationId: 'q-1',
  quotationNumber: 'INQ-2026-1148',
  quotationStatus,
  totalMinor: 5_150_000n,
});

describe('PipelineService.syncFromQuotation', () => {
  it('moves the lead to Quotation when a quotation is sent', async () => {
    const tx = makeTx(leadRow('new'));
    const { service, timeline } = makeService();
    await expect(service.syncFromQuotation(tx as never, actor, input('sent'))).resolves.toBe('Quotation');
    expect(tx.lead.update.mock.calls[0][0].data).toMatchObject({ stageId: 's-quote', lifecycleStatus: 'open' });
    expect(tx.leadStageChange.create.mock.calls[0][0].data.reason).toBe('Quotation INQ-2026-1148 sent.');
    expect(timeline.record.mock.calls[0][0].body).toContain('New → Quotation');
  });

  it('closes the lead as Won with the quotation total when accepted', async () => {
    const tx = makeTx(leadRow('negotiation'));
    const { service } = makeService();
    await expect(service.syncFromQuotation(tx as never, actor, input('won'))).resolves.toBe('Won');
    expect(tx.lead.update.mock.calls[0][0].data).toMatchObject({
      stageId: 's-won',
      lifecycleStatus: 'won',
      estimatedValueMinor: 5_150_000n,
      lostReasonId: null,
    });
    expect(tx.leadStageChange.create.mock.calls[0][0].data.reason).toBe('Quotation INQ-2026-1148 accepted.');
  });

  it('never moves a lead backwards', async () => {
    const tx = makeTx(leadRow('negotiation'));
    const { service } = makeService();
    await expect(service.syncFromQuotation(tx as never, actor, input('sent'))).resolves.toBeNull();
    expect(tx.lead.update).not.toHaveBeenCalled();
  });

  it('does nothing for draft or lost quotations', async () => {
    const tx = makeTx(leadRow('quotation'));
    const { service } = makeService();
    await expect(service.syncFromQuotation(tx as never, actor, input('lost'))).resolves.toBeNull();
    await expect(service.syncFromQuotation(tx as never, actor, input('draft'))).resolves.toBeNull();
    expect(tx.lead.findFirst).not.toHaveBeenCalled();
  });

  it('leaves a lost lead alone unless the quotation is accepted', async () => {
    const tx = makeTx(leadRow('lost', 'lost'));
    const { service } = makeService();
    await expect(service.syncFromQuotation(tx as never, actor, input('negotiation'))).resolves.toBeNull();
    await expect(service.syncFromQuotation(tx as never, actor, input('won'))).resolves.toBe('Won');
    expect(tx.lead.update.mock.calls[0][0].data).toMatchObject({ lostAt: null, lostNotes: null });
  });
});

describe('PipelineService.changeStage to Lost', () => {
  it('closes the lead’s open quotations with the loss reason', async () => {
    const lead = leadRow('quotation');
    const tx = makeTx(lead);
    tx.quotation.findMany.mockResolvedValue([
      { id: 'q-1', quotationNumber: 'INQ-1', status: 'sent' },
      { id: 'q-2', quotationNumber: 'INQ-2', status: 'draft' },
    ]);
    const prisma = {
      lead: { findFirst: jest.fn().mockResolvedValue(lead) },
      pipelineStage: { findFirst: jest.fn().mockResolvedValue(STAGES[4]) },
      lossReason: { findFirst: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Price' }) },
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    };
    const { service, audit } = makeService(prisma);
    await service.changeStage(actor, 'lead-1', {
      stageId: 's-lost',
      lostReasonId: 'r-1',
      lostNotes: 'Competitor 10% cheaper',
    } as never);
    expect(tx.quotation.findMany.mock.calls[0][0].where).toMatchObject({
      leadId: 'lead-1',
      status: { notIn: ['won', 'lost'] },
    });
    expect(tx.quotation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ['q-1', 'q-2'] } },
      data: { status: 'lost', lostReason: 'Price — Competitor 10% cheaper' },
    });
    // one lead audit + one per quotation
    expect(audit.record).toHaveBeenCalledTimes(3);
  });

  it('does not touch quotations for non-lost moves', async () => {
    const lead = leadRow('new');
    const tx = makeTx(lead);
    const prisma = {
      lead: { findFirst: jest.fn().mockResolvedValue(lead) },
      pipelineStage: { findFirst: jest.fn().mockResolvedValue(STAGES[1]) },
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    };
    const { service } = makeService(prisma);
    await service.changeStage(actor, 'lead-1', { stageId: 's-quote' } as never);
    expect(tx.quotation.findMany).not.toHaveBeenCalled();
  });
});
