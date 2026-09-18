import { actor } from '../../../../testing/fixtures';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { SessionsController } from './sessions.controller';
import { RbacController } from './rbac.controller';
import { createRequest } from '../../../../testing/http-context';

describe('identity HTTP controllers', () => {
  const auth = {
    login: jest.fn(),
    refresh: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    me: jest.fn(),
    listSessions: jest.fn(),
    revokeOtherSessions: jest.fn(),
    revokeSession: jest.fn(),
    loginHistory: jest.fn(),
  };
  const rbac = {
    listPermissions: jest.fn(),
    listRoles: jest.fn(),
    createRole: jest.fn(),
    getRole: jest.fn(),
    updateRole: jest.fn(),
    deleteRole: jest.fn(),
    replacePermissions: jest.fn(),
    matrix: jest.fn(),
    listMemberships: jest.fn(),
    assignUser: jest.fn(),
    updateMembership: jest.fn(),
    assignRoles: jest.fn(),
  };
  const user = actor();
  const req = createRequest({ headers: { 'x-forwarded-for': '10.0.0.1', 'user-agent': 'jest' } });

  it('delegates auth, me, and sessions', () => {
    const authController = new AuthController(auth as never);
    const me = new MeController(auth as never);
    const sessions = new SessionsController(auth as never);
    const login = { email: 'a@b.c', password: 'x', deviceId: 'device-01' };
    authController.login(login, req);
    authController.refresh({ refreshToken: 'r'.repeat(20) }, req);
    authController.forgotPassword({ email: 'a@b.c' }, req);
    authController.resetPassword({ email: 'a@b.c', otp: '123456', newPassword: 'CorrectHorse1' });
    authController.logout(user, { refreshToken: 'r'.repeat(20) });
    authController.changePassword(user, { currentPassword: 'old', newPassword: 'CorrectHorse1' });
    me.me(user);
    sessions.listSessions(user);
    sessions.revokeOthers(user);
    sessions.revokeSession(user, user.sessionId);
    sessions.loginHistory(user);
    expect(auth.login).toHaveBeenCalled();
    expect(auth.me).toHaveBeenCalledWith(user);
  });

  it('delegates RBAC', () => {
    const controller = new RbacController(rbac as never);
    controller.listPermissions();
    controller.listRoles(user);
    controller.createRole(user, { code: 'custom.x', name: 'X' });
    controller.getRole(user, 'role-1');
    controller.updateRole(user, 'role-1', { name: 'Y' });
    controller.deleteRole(user, 'role-1');
    controller.replacePermissions(user, 'role-1', { permissionCodes: ['lead:read'] });
    controller.matrix(user);
    controller.listMemberships(user);
    controller.assignUser(user, { email: 'n@x.test', fullName: 'N', roleIds: ['r'] });
    controller.updateMembership(user, 'm1', { status: 'active' });
    controller.assignRoles(user, 'm1', { roleIds: ['r'] });
    expect(rbac.matrix).toHaveBeenCalledWith(user.tenantId);
  });
});
