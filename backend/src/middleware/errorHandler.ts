import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(`[${new Date().toISOString()}] Error:`, err.message);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Token invalide ou expiré', code: 'AUTH_TOKEN_INVALID' });
    return;
  }

  if ((err as any).code === 'P2002') {
    res.status(409).json({ error: 'Cet enregistrement existe déjà', code: 'DUPLICATE_ENTRY' });
    return;
  }

  if ((err as any).code === 'P2025') {
    res.status(404).json({ error: 'Enregistrement non trouvé', code: 'NOT_FOUND' });
    return;
  }

  res.status(500).json({ error: 'Erreur interne du serveur', code: 'INTERNAL_ERROR' });
}
