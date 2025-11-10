import { Hono } from 'hono';
import { ProjectRepository } from '@tracer/db';
import { z } from 'zod';
import { requireAuth } from '../middleware/jwt-auth';
import { logger } from '../logger';

const projects = new Hono();

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

projects.post('/', requireAuth, async (c) => {
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
    const validated = createProjectSchema.parse(body);

    const repository = new ProjectRepository();
    const project = await repository.create({
      userId: user.id,
      name: validated.name,
      description: validated.description,
    });

    return c.json({ project }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.issues }, 400);
    }
    logger.error({ error }, 'Failed to create project');
    return c.json({ error: 'Failed to create project' }, 500);
  }
});

projects.get('/', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const repository = new ProjectRepository();
    const projectsList = await repository.list(user.id);

    return c.json({ projects: projectsList });
  } catch (error) {
    logger.error({ error }, 'Failed to list projects');
    return c.json({ error: 'Failed to list projects' }, 500);
  }
});

projects.get('/:id', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) {
      return c.json({ error: 'Invalid project ID' }, 400);
    }

    const repository = new ProjectRepository();
    const project = await repository.findById(id, user.id);

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json({ project });
  } catch (error) {
    logger.error({ error }, 'Failed to get project');
    return c.json({ error: 'Failed to get project' }, 500);
  }
});

projects.patch('/:id', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) {
      return c.json({ error: 'Invalid project ID' }, 400);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const validated = updateProjectSchema.parse(body);

    const repository = new ProjectRepository();
    const project = await repository.update(id, user.id, validated);

    return c.json({ project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.issues }, 400);
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return c.json({ error: 'Project not found' }, 404);
    }
    logger.error({ error }, 'Failed to update project');
    return c.json({ error: 'Failed to update project' }, 500);
  }
});

projects.delete('/:id', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) {
      return c.json({ error: 'Invalid project ID' }, 400);
    }

    const repository = new ProjectRepository();
    await repository.delete(id, user.id);

    return c.json({ message: 'Project deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to delete project');
    return c.json({ error: 'Failed to delete project' }, 500);
  }
});

export default projects;


