import type { NextFunction, Request, Response } from 'express';

export function createConcurrencyLimit(maxConcurrent: number) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error('maxConcurrent must be a positive integer');
  }

  let active = 0;
  return (req: Request, res: Response, next: NextFunction) => {
    if (active >= maxConcurrent) {
      res.status(503).json({ success: false, error: '当前处理任务较多，请稍后重试', requestId: req.requestId });
      return;
    }

    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active -= 1;
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
