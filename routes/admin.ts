import { Request, Response } from 'express';
import Routes from './common';
import { DataProviderError } from '../storage/providers';
import { AdminUser, toAdminUser, User, UserRole, UserStatus } from '../models/users';

/*
User management for admins, mounted at /api/admin behind requireAdmin (see middleware/auth.ts).
Admins have no extra access to anyone's menus, items and so on; this is all they get on top of
what everyone has.

Accounts are never deleted, only turned off: rejecting a request or disabling an account sets it
to DISABLED, which keeps the email reserved (a rejected person can't just request again) and
keeps what the account owns.
*/

const ROLES: UserRole[] = ['USER', 'ADMIN'];

function conflict(message: string): DataProviderError {
  return new DataProviderError(message, 409);
}

export type UserCounts = Record<UserStatus, number>;

export class AdminRoutes extends Routes {
  registerRoutes(): void {
    const handle = (fn: (req: Request, res: Response) => Promise<void>) => {
      return async (req: Request, res: Response) => {
        try {
          await fn(req, res);
        } catch (e: any) {
          this.handleError(res, e);
        }
      };
    };

    const load = async (req: Request): Promise<User> => {
      const user = await this.dataProvider.getUser(req.params.userId as string);
      if (!user) throw new DataProviderError('User not found', 404);
      return user;
    };

    // The admin making the request is never "someone else"
    const refuseSelf = (req: Request, user: User, message: string) => {
      if (user.id === req.user!.id) throw conflict(message);
    };

    // Keeps at least one admin who can sign in, so the app can't lock everyone out of user management
    const refuseLastAdmin = async (user: User, message: string) => {
      if (user.role !== 'ADMIN' || user.status !== 'ACTIVE') return;
      const others = (await this.dataProvider.getUsers()).filter((u) => u.id !== user.id && u.role === 'ADMIN' && u.status === 'ACTIVE');
      if (others.length === 0) throw conflict(message);
    };

    const respond = (res: Response, user: User) => {
      const body: AdminUser = toAdminUser(user);
      res.json(body);
    };

    // Everyone, oldest first, with how many are in each state (for the pending badge). There are
    // few enough accounts that the client does the sorting and filtering.
    this.router.get('/users', handle(async (_req, res) => {
      const users = await this.dataProvider.getUsers();
      const counts: UserCounts = { PENDING: 0, ACTIVE: 0, DISABLED: 0 };
      for (const user of users) counts[user.status]++;
      res.json({ users: users.map(toAdminUser), counts });
    }));

    this.router.post('/users/:userId/approve', handle(async (req, res) => {
      const user = await load(req);
      if (user.status !== 'PENDING') throw conflict('That account is not waiting for approval.');
      respond(res, await this.dataProvider.updateUser(user.id, { status: 'ACTIVE', approvedAt: new Date(), approvedById: req.user!.id }));
    }));

    this.router.post('/users/:userId/reject', handle(async (req, res) => {
      const user = await load(req);
      if (user.status !== 'PENDING') throw conflict('That account is not waiting for approval.');
      respond(res, await this.dataProvider.updateUser(user.id, { status: 'DISABLED' }));
    }));

    this.router.post('/users/:userId/disable', handle(async (req, res) => {
      const user = await load(req);
      if (user.status !== 'ACTIVE') throw conflict('That account is not active.');
      refuseSelf(req, user, "You can't disable your own account.");
      await refuseLastAdmin(user, "That's the last active admin, so it can't be disabled.");
      const updated = await this.dataProvider.updateUser(user.id, { status: 'DISABLED' });
      // Already locked out on their next request; this also removes the stored sessions
      await this.dataProvider.deleteSessionsForUser(user.id);
      respond(res, updated);
    }));

    // Turns a disabled account back on (including a rejected request, which counts as approving it)
    this.router.post('/users/:userId/enable', handle(async (req, res) => {
      const user = await load(req);
      if (user.status !== 'DISABLED') throw conflict('That account is not disabled.');
      respond(res, await this.dataProvider.updateUser(user.id, {
        status: 'ACTIVE',
        approvedAt: user.approvedAt ?? new Date(),
        approvedById: user.approvedById ?? req.user!.id,
      }));
    }));

    // Body: { role: 'USER' | 'ADMIN' }
    this.router.patch('/users/:userId/role', handle(async (req, res) => {
      const role = req.body?.role;
      if (!ROLES.includes(role)) throw new DataProviderError('role must be USER or ADMIN', 400);
      const user = await load(req);
      refuseSelf(req, user, "You can't change your own role.");
      if (role === 'USER') {
        await refuseLastAdmin(user, "That's the last active admin, so it can't be made a regular user.");
      }
      respond(res, await this.dataProvider.updateUser(user.id, { role }));
    }));
  }
}
