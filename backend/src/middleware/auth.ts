import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

/**
 * Middleware d'authentification.
 * Permet la première connexion pour les comptes avec mustChangePassword = true
 * même si aucun token JWT n'est fourni.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    // Pas de token : vérifier si c'est une première connexion
    const email = req.body && typeof req.body === 'object' ? (req.body as any).email : undefined;
    if (email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && user.mustChangePassword) {
        req.userId = user.id;
        req.userRole = user.role;
        return next();
      }
    }

    return res.status(401).json({ error: 'Token manquant ou utilisateur non autorisé' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string };
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

/**
 * Middleware pour vérifier le rôle
 */
export function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.userRole !== role) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    next();
  };
}