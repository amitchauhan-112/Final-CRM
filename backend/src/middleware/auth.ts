import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, JWTPayload } from '../types/index.js';

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
};

export const requireOperationsOrAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'OPERATIONS') {
    res.status(403).json({ success: false, error: 'Operations or Admin access required' });
    return;
  }
  next();
};

export const requireFinanceOrAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'FINANCE') {
    res.status(403).json({ success: false, error: 'Finance or Admin access required' });
    return;
  }
  next();
};

export const requireTripCaptain = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'TRIP_CAPTAIN') {
    res.status(403).json({ success: false, error: 'Trip Captain access required' });
    return;
  }
  next();
};

export const requireTripCaptainOrAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'TRIP_CAPTAIN') {
    res.status(403).json({ success: false, error: 'Trip Captain or Admin access required' });
    return;
  }
  next();
};

export const requireAdminOrSelf = (userIdParam: string) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const targetId = req.params[userIdParam];
    if (req.user?.role === 'ADMIN' || req.user?.id === targetId) {
      next();
    } else {
      res.status(403).json({ success: false, error: 'Access denied' });
    }
  };
