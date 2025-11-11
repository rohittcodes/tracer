import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { UserRepository } from '@tracer/db';
import { logger } from '../logger';

// Use a getter to defer instantiation and avoid module loading issues
let _userRepository: UserRepository | null = null;
function getUserRepository(): UserRepository {
  if (!_userRepository) {
    _userRepository = new UserRepository();
  }
  return _userRepository;
}
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface JWTPayload {
  userId: number;
  email: string;
}

export type Variables = {
  user?: {
    id: number;
    email: string;
    name: string | null;
  };
};

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

export async function requireAuth(c: Context<{ Variables: Variables }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return c.json({ error: 'Invalid Authorization header format. Use "Bearer <token>"' }, 401);
  }

  const token = parts[1];
  const payload = verifyToken(token);
  
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Fetch user to ensure they still exist
  const user = await getUserRepository().findById(payload.userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  c.set('user', {
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return next();
}

export async function optionalAuth(c: Context<{ Variables: Variables }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      const token = parts[1];
      const payload = verifyToken(token);
      
      if (payload) {
        const user = await getUserRepository().findById(payload.userId);
        if (user) {
          c.set('user', {
            id: user.id,
            email: user.email,
            name: user.name,
          });
        }
      }
    }
  }

  return next();
}

