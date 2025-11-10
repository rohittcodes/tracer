import { Context, Next } from 'hono';
import { ApiKeyRepository, ApiKey } from '@tracer/db';
import { logger } from '../logger';

const apiKeyRepository = new ApiKeyRepository();

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

export async function apiKeyAuth(c: Context<{ Variables: Variables }>, next: Next) {
  if (c.req.path === '/health') {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return c.json({ error: 'Invalid Authorization header format' }, 401);
  }

  const [scheme, key] = parts;
  if (scheme !== 'Bearer' && scheme !== 'ApiKey') {
    return c.json({ error: 'Invalid Authorization scheme. Use "Bearer" or "ApiKey"' }, 401);
  }

  const apiKey = await apiKeyRepository.validate(key);
  
  if (!apiKey) {
    return c.json({ error: 'Invalid or expired API key' }, 401);
  }

  c.set('apiKey', apiKey);
  c.set('service', apiKey.service || null);

  return next();
}

export async function optionalApiKeyAuth(c: Context<{ Variables: Variables }>, next: Next) {
  // Check Authorization header first
  const authHeader = c.req.header('Authorization');
  
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2) {
      const [scheme, key] = parts;
      if (scheme === 'Bearer' || scheme === 'ApiKey') {
        const apiKey = await apiKeyRepository.validate(key);
        if (apiKey) {
          c.set('apiKey', apiKey);
          c.set('service', apiKey.service || null);
          return next();
        }
      }
    }
  }

  // For SSE endpoints, also check query parameter (EventSource doesn't support custom headers)
  const apiKeyParam = c.req.query('apiKey');
  if (apiKeyParam) {
    const apiKey = await apiKeyRepository.validate(apiKeyParam);
    if (apiKey) {
      c.set('apiKey', apiKey);
      c.set('service', apiKey.service || null);
    }
  }

  return next();
}

