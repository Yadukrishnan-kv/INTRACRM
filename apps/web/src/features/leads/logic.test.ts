import { describe, expect, it } from 'vitest';
import {
  applyScope,
  canSearch,
  checkStageMove,
  commsOutcome,
  createLeadBody,
  defaultOwner,
  EMPTY_LEAD_FORM,
  fieldErrorsFrom,
  fillMessageTemplate,
  moveCard,
  phoneError,
  relativeTime,
  safeLaunchUri,
  searchHitPath,
  stepperIndex,
  updateLeadBody,
  validateLeadForm,
  type LeadFormState,
} from './logic';

const form = (patch: Partial<LeadFormState> = {}): LeadFormState => ({ ...EMPTY_LEAD_FORM, title: 'Solar 5kW', ownerMembershipId: 'm1', ...patch });

describe('lead form validation', () => {
  it('requires a 2+ char title and an owner on create only', () => {
    expect(validateLeadForm(form({ title: 'a', ownerMembershipId: '' }), false)).toEqual({
      title: 'Title must be at least 2 characters',
      ownerMembershipId: 'Assigned staff is required',
    });
    expect(validateLeadForm(form({ ownerMembershipId: '' }), true)).toEqual({});
  });

  it('accepts E.164 and Indian mobiles, rejects others', () => {
    expect(phoneError('+919876543210')).toBeUndefined();
    expect(phoneError('98765 43210')).toBeUndefined();
    expect(phoneError('12345')).toBe('Use E.164 or a 10-digit mobile number');
    expect(phoneError('')).toBeUndefined();
  });

  it('rejects bad email, negative/garbage value and past follow-ups', () => {
    const now = new Date('2026-01-01T10:00:00');
    const errors = validateLeadForm(form({ primaryEmail: 'x@', estimatedValue: '-5', followUpDueAt: '2025-12-31T10:00' }), false, now);
    expect(Object.keys(errors).sort()).toEqual(['estimatedValueMinor', 'followUp.dueAt', 'primaryEmail']);
  });
});

describe('lead bodies', () => {
  it('create omits blanks and converts rupees to paise', () => {
    const body = createLeadBody(form({ estimatedValue: '1,250.5', city: '  ', followUpDueAt: '2030-01-01T09:30', followUpNotes: ' call ' }));
    expect(body).toMatchObject({ title: 'Solar 5kW', ownerMembershipId: 'm1', estimatedValueMinor: 125050 });
    expect(body).not.toHaveProperty('city');
    expect(body.followUp).toMatchObject({ type: 'call', notes: 'call' });
  });

  it('update sends nulls for cleared fields and the version', () => {
    const body = updateLeadBody(form({ ownerMembershipId: '' }), 4);
    expect(body).toMatchObject({ city: null, estimatedValueMinor: null, version: 4 });
    expect(body).not.toHaveProperty('ownerMembershipId');
  });

  it('maps API field errors', () => {
    expect(fieldErrorsFrom({ errors: [{ field: 'primaryPhone', message: 'bad' }, { message: 'x' }] })).toEqual({ primaryPhone: 'bad' });
    expect(fieldErrorsFrom(new Error('x'))).toEqual({});
  });

  it('defaults the owner to the first staff member like mobile', () => {
    expect(defaultOwner([{ id: 'a' }, { id: 'b' }], '')).toBe('a');
    expect(defaultOwner([{ id: 'a' }], 'b')).toBe('b');
    expect(defaultOwner([], '')).toBe('');
  });
});

describe('list helpers', () => {
  const rows = [{ ownerMembershipId: 'me' }, { ownerMembershipId: null }, { ownerMembershipId: 'other' }];
  it('scopes rows', () => {
    expect(applyScope(rows, 'mine', 'me')).toHaveLength(1);
    expect(applyScope(rows, 'unassigned', 'me')).toEqual([{ ownerMembershipId: null }]);
    expect(applyScope(rows, 'all', null)).toHaveLength(3);
  });

  it('formats relative time like the mobile card', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    expect(relativeTime('2026-01-01T23:59:50Z', now)).toBe('1m ago');
    expect(relativeTime('2026-01-01T21:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2025-12-30T00:00:00Z', now)).toBe('3d ago');
    expect(relativeTime(null, now)).toBe('');
  });
});

describe('pipeline', () => {
  const stages = [
    { id: 's1', name: 'New', isLost: false },
    { id: 's2', name: 'Won', isLost: false },
    { id: 's3', name: 'Lost', isLost: true },
  ];

  it('checks stage moves', () => {
    expect(checkStageMove(stages, 's1', 's1', 1)).toEqual({ ok: false, reason: 'same' });
    expect(checkStageMove(stages, 's1', 'zz', 1)).toEqual({ ok: false, reason: 'unknown' });
    expect(checkStageMove(stages, 's1', 's3', 0)).toEqual({ ok: false, reason: 'no_loss_reasons' });
    expect(checkStageMove(stages, 's1', 's3', 2)).toEqual({ ok: true, needsLossReason: true });
    expect(checkStageMove(stages, 's1', 's2', 0)).toEqual({ ok: true, needsLossReason: false });
  });

  it('moves a card optimistically between columns', () => {
    const card = { id: 'c1', stageId: 's1', stageName: 'New', estimatedValueMinor: 500 };
    const cols = [
      { stage: { id: 's1', name: 'New' }, count: 1, valueMinor: 500, leads: [card] },
      { stage: { id: 's2', name: 'Won' }, count: 0, valueMinor: 0, leads: [] as (typeof card)[] },
    ];
    const next = moveCard(cols, 'c1', 's2');
    expect(next[0]).toMatchObject({ count: 0, valueMinor: 0, leads: [] });
    expect(next[1]).toMatchObject({ count: 1, valueMinor: 500 });
    expect(next[1]?.leads[0]).toMatchObject({ stageId: 's2', stageName: 'Won' });
    expect(moveCard(cols, 'missing', 's2')).toBe(cols);
  });

  it('positions the stepper, using the Lost stage when lost', () => {
    expect(stepperIndex(stages, 'won', false)).toBe(1);
    expect(stepperIndex(stages, 'New', true)).toBe(2);
    expect(stepperIndex(stages, 'unknown', false)).toBe(0);
  });
});

describe('comms + search', () => {
  it('fills message templates', () => {
    expect(fillMessageTemplate('Hi {{customer_name}}, {{ lead_number }} from {{staff_name}}', { customerName: 'Ravi', title: 't', leadNumber: 'L-1', city: null }, 'Asha')).toBe(
      'Hi Ravi, L-1 from Asha',
    );
  });

  it('only launches safe URIs and only when not sent by a gateway', () => {
    expect(safeLaunchUri('javascript:alert(1)')).toBeNull();
    expect(commsOutcome({ mode: 'launch', launchUri: 'https://wa.me/91', warning: null, channel: 'whatsapp' })).toEqual({
      kind: 'launch',
      uri: 'https://wa.me/91',
      warning: null,
    });
    expect(commsOutcome({ mode: 'sent', launchUri: 'tel:+91', warning: null, channel: 'call' })).toEqual({
      kind: 'toast',
      message: 'Call connecting…',
      warning: null,
    });
    expect(commsOutcome({ mode: 'sent', launchUri: null, warning: 'Gateway down', channel: 'sms' })).toEqual({
      kind: 'toast',
      message: null,
      warning: 'Gateway down',
    });
  });

  it('routes search hits and gates on 2 chars', () => {
    expect(canSearch(' a ')).toBe(false);
    expect(canSearch('ab')).toBe(true);
    expect(searchHitPath({ type: 'quotation', id: 'h', leadId: 'l', quotationId: 'q' })).toBe('/quotations/q');
    expect(searchHitPath({ type: 'lead', id: 'h', leadId: 'l', quotationId: null })).toBe('/leads/l');
  });
});
