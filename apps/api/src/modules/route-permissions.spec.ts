import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../common/auth/current-user.decorator';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { actor } from '../testing/fixtures';
import { TimelineController } from './activities/interface/http/timeline.controller';
import { LeadsController } from './crm-leads/interface/http/leads.controller';
import { StaffController } from './directory/interface/http/staff.controller';
import { PERMISSION } from './identity/domain/system-roles';
import { IncentivesController } from './incentives/interface/http/incentives.controller';
import { QuotationsController } from './quotations/interface/http/quotations.controller';
import { ReportExportController } from './reporting/interface/http/report-export.controller';
import { FollowUpsController } from './tasks/interface/http/follow-ups.controller';

type Controller = abstract new (...args: never[]) => object;

function routeContext(controller: Controller, method: string, user: AuthUser): ExecutionContext {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`${controller.name}.${method} is not a route handler`);
  }
  const request = { user, path: '/', header: () => undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

const guard = new PermissionsGuard(new Reflector());

function allows(controller: Controller, method: string, permissions: string[]): boolean {
  try {
    return guard.canActivate(routeContext(controller, method, actor({ permissions })));
  } catch (error) {
    expect(error).toMatchObject({ code: ErrorCodes.FORBIDDEN });
    return false;
  }
}

describe('route permissions (audit fixes)', () => {
  it('DELETE /leads/:leadId requires lead:delete, not lead:update', () => {
    expect(allows(LeadsController, 'remove', [PERMISSION.leadRead, PERMISSION.leadUpdate])).toBe(false);
    expect(allows(LeadsController, 'remove', [PERMISSION.leadDelete])).toBe(true);
  });

  it('DELETE /quotations/:id requires quotation:delete, not quotation:create', () => {
    expect(allows(QuotationsController, 'remove', [PERMISSION.quotationCreate])).toBe(false);
    expect(allows(QuotationsController, 'remove', [PERMISSION.quotationDelete])).toBe(true);
  });

  it('POST /leads/:leadId/quotations needs quotation:create (and send, as it issues a sent quotation)', () => {
    expect(allows(TimelineController, 'sendQuotation', [PERMISSION.quotationSend])).toBe(false);
    expect(allows(TimelineController, 'sendQuotation', [PERMISSION.quotationCreate])).toBe(false);
    expect(
      allows(TimelineController, 'sendQuotation', [PERMISSION.quotationCreate, PERMISSION.quotationSend]),
    ).toBe(true);
  });

  it('GET /reports/leads/export requires lead:export as well as lead:read', () => {
    expect(allows(ReportExportController, 'leads', [PERMISSION.leadRead])).toBe(false);
    expect(allows(ReportExportController, 'leads', [PERMISSION.leadRead, PERMISSION.leadExport])).toBe(true);
  });

  it('DELETE /staff/:staffId requires tenant:manage_users', () => {
    expect(allows(StaffController, 'remove', [PERMISSION.leadRead])).toBe(false);
    expect(allows(StaffController, 'remove', [PERMISSION.tenantManageUsers])).toBe(true);
  });

  it('POST /follow-ups/:id/cancel requires follow_up:update', () => {
    expect(allows(FollowUpsController, 'cancel', [PERMISSION.followUpRead])).toBe(false);
    expect(allows(FollowUpsController, 'cancel', [PERMISSION.followUpUpdate])).toBe(true);
  });

  it('POST /incentives/payouts/:id/void requires incentive:manage', () => {
    expect(allows(IncentivesController, 'voidPayout', [PERMISSION.incentiveRead])).toBe(false);
    expect(allows(IncentivesController, 'voidPayout', [PERMISSION.incentiveManage])).toBe(true);
  });
});
