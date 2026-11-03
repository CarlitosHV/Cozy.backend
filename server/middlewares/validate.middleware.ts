import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          errors: (err.issues || []).map((e: any) => ({
            field: e.path ? e.path.join('.') : '',
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
};
