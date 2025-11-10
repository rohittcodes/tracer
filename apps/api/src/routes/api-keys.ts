import { Hono } from 'hono';
import { ApiKeyRepository } from '@tracer/db';
import { z } from 'zod';
import { requireAuth } from '../middleware/jwt-auth';
import { logger } from '../logger';

const apiKeys = new Hono();

const createApiKeySchema = z.object({
  name: z.string().optional(),
  service: z.string().optional(),
  expiresAt: z.string().datetime().optional().transform((val) => val ? new Date(val) : undefined),
});

apiKeys.post('/', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const validated = createApiKeySchema.parse(body);

    // Get projectId from query or body
    const projectIdParam = c.req.query('projectId') || body.projectId;
    if (!projectIdParam) {
      return c.json({ error: 'projectId is required' }, 400);
    }
    const projectId = parseInt(String(projectIdParam), 10);
    if (isNaN(projectId)) {
      return c.json({ error: 'Invalid projectId' }, 400);
    }

    // Verify project belongs to user
    const { ProjectRepository } = await import('@tracer/db');
    const projectRepo = new ProjectRepository();
    const project = await projectRepo.findById(projectId, user.id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const repository = new ApiKeyRepository();
    const result = await repository.create({
      projectId,
      name: validated.name,
      service: validated.service,
      expiresAt: validated.expiresAt,
    });

    return c.json({
      id: result.id,
      key: result.key,
      name: validated.name,
      service: validated.service,
      createdAt: new Date().toISOString(),
      warning: 'Store this key securely. It cannot be retrieved again.',
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.issues }, 400);
    }
    logger.error({ error }, 'Failed to create API key');
    return c.json({ error: 'Failed to create API key' }, 500);
  }
});

apiKeys.get('/', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const projectIdParam = c.req.query('projectId');
    if (!projectIdParam) {
      return c.json({ error: 'projectId is required' }, 400);
    }
    const projectId = parseInt(projectIdParam, 10);
    if (isNaN(projectId)) {
      return c.json({ error: 'Invalid projectId' }, 400);
    }

    // Verify project belongs to user
    const { ProjectRepository } = await import('@tracer/db');
    const projectRepo = new ProjectRepository();
    const project = await projectRepo.findById(projectId, user.id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const service = c.req.query('service');
    const repository = new ApiKeyRepository();
    const keys = await repository.list(projectId, service || undefined);

    const safeKeys = keys.map((key) => ({
      id: key.id,
      name: key.name,
      service: key.service,
      active: key.active,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
    }));

    return c.json({ keys: safeKeys });
  } catch (error) {
    logger.error({ error }, 'Failed to list API keys');
    return c.json({ error: 'Failed to list API keys' }, 500);
  }
});

apiKeys.delete('/:id', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const id = parseInt(c.req.param('id'), 10);
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid API key ID' }, 400);
    }

    // Get projectId from query to verify ownership
    const projectIdParam = c.req.query('projectId');
    if (!projectIdParam) {
      return c.json({ error: 'projectId is required' }, 400);
    }
    const projectId = parseInt(projectIdParam, 10);
    if (isNaN(projectId)) {
      return c.json({ error: 'Invalid projectId' }, 400);
    }

    // Verify project belongs to user
    const { ProjectRepository } = await import('@tracer/db');
    const projectRepo = new ProjectRepository();
    const project = await projectRepo.findById(projectId, user.id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const repository = new ApiKeyRepository();
    await repository.revoke(id, projectId);

    return c.json({ message: 'API key revoked successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to revoke API key');
    return c.json({ error: 'Failed to revoke API key' }, 500);
  }
});

export default apiKeys;

