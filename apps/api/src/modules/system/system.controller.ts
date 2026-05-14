import type { Request, Response } from 'express';
import type { SystemHealthcheckJobInput } from '@autoops/types';
import { UnauthenticatedError } from '@autoops/utils';
import { enqueueWorkerHealthcheckJob } from './system.queue.js';

type EnqueueWorkerHealthcheckResponse = {
  data: {
    jobId: string | null;
    queue: string;
    name: string;
  };
};

export class SystemController {
  enqueueWorkerHealthcheck = async (
    req: Request<Record<string, never>, unknown, SystemHealthcheckJobInput>,
    res: Response<EnqueueWorkerHealthcheckResponse>,
  ): Promise<void> => {
    if (!req.auth) {
      throw new UnauthenticatedError();
    }

    const job = await enqueueWorkerHealthcheckJob(req.body, req.auth.userId);

    res.status(202).json({
      data: job,
    });
  };
}

export const systemController = new SystemController();