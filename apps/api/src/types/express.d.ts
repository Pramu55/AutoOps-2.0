import 'express';
import type { Logger } from '@autoops/logger';
import type { JwtPayload } from '@autoops/types';

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      auth?: {
        userId: string;
        email: string;
        orgId?: string;
        role?: string;
        token: JwtPayload;
      };
    }
  }
}
