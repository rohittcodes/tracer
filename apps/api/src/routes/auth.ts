import { Hono } from 'hono';
import { UserRepository } from '@tracer/db';
import { generateToken, Variables } from '../middleware/jwt-auth';
import { logger } from '../logger';
import { z } from 'zod';

const auth = new Hono<{ Variables: Variables }>();

// Use a getter to defer instantiation and avoid module loading issues
let _userRepository: UserRepository | null = null;
function getUserRepository(): UserRepository {
  if (!_userRepository) {
    _userRepository = new UserRepository();
  }
  return _userRepository;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

auth.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const validated = registerSchema.parse(body);

    const user = await getUserRepository().create({
      email: validated.email,
      password: validated.password,
      name: validated.name,
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400);
    }
    if (error instanceof Error && error.message.includes('already exists')) {
      return c.json({ error: error.message }, 409);
    }
    logger.error({ error }, 'Registration failed');
    return c.json({ error: 'Registration failed' }, 500);
  }
});

auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const validated = loginSchema.parse(body);

    const user = await getUserRepository().findByEmail(validated.email);
    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    const isValid = await getUserRepository().verifyPassword(user, validated.password);
    if (!isValid) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400);
    }
    logger.error({ error }, 'Login failed');
    return c.json({ error: 'Login failed' }, 500);
  }
});

auth.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  return c.json({ user });
});

export { auth };

