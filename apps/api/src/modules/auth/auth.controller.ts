import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import { prisma } from '@autoops/database';
import { NotFoundError } from '@autoops/utils';

export class AuthController {
  register = async (req: Request, res: Response): Promise<void> => {
    const session = await authService.register(req.body);
    res.status(201).json({ data: session });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const session = await authService.login(req.body, {
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
    res.json({ data: session });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const tokens = await authService.refresh(req.body.refreshToken, {
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });
    res.json({ data: tokens });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    if (req.body?.refreshToken) {
      await authService.logout(req.body.refreshToken);
    }
    res.status(204).end();
  };

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      include: { memberships: { include: { organization: true } } },
    });
    if (!user) throw new NotFoundError('User');
    res.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt.toISOString(),
        },
        organizations: user.memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          role: m.role,
        })),
      },
    });
  };
}

export const authController = new AuthController();
