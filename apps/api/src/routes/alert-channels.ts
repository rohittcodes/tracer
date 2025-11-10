import { Hono } from 'hono';
import { AlertChannelRepository, AlertChannel } from '@tracer/db';
import { z } from 'zod';
import { ApiKey } from '@tracer/db';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const alertChannels = new Hono<{ Variables: Variables }>();

const createSlackChannelSchema = z.object({
  projectId: z.number(),
  name: z.string().optional(),
  service: z.string().optional(),
  channel: z.string().min(1),
  webhookUrl: z.string().url().optional(),
  accessToken: z.string().optional(),
});

const createEmailChannelSchema = z.object({
  projectId: z.number(),
  name: z.string().optional(),
  service: z.string().optional(),
  recipients: z.array(z.string().email()).min(1),
  fromEmail: z.string().email().optional(),
  resendApiKey: z.string().optional(),
});

alertChannels.post('/slack', async (c) => {
  try {
    const apiKey = c.get('apiKey');
    const defaultService = apiKey?.service || null;

    let body: any;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const validated = createSlackChannelSchema.parse(body);

    const repository = new AlertChannelRepository();
    const channel = await repository.create({
      projectId: validated.projectId,
      channelType: 'slack',
      name: validated.name,
      service: validated.service || defaultService || undefined,
      config: {
        slack: {
          channel: validated.channel,
          webhookUrl: validated.webhookUrl,
          accessToken: validated.accessToken,
        },
      },
    });

    return c.json({
      id: channel.id,
      channelType: channel.channelType,
      name: channel.name,
      service: channel.service,
      createdAt: channel.createdAt,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.issues }, 400);
    }
    return c.json({ error: 'Failed to create Slack channel' }, 500);
  }
});

alertChannels.post('/email', async (c) => {
  try {
    const apiKey = c.get('apiKey');
    const defaultService = apiKey?.service || null;

    let body: any;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const validated = createEmailChannelSchema.parse(body);

    const repository = new AlertChannelRepository();
    const channel = await repository.create({
      projectId: validated.projectId,
      channelType: 'email',
      name: validated.name,
      service: validated.service || defaultService || undefined,
      config: {
        email: {
          recipients: validated.recipients,
          fromEmail: validated.fromEmail,
          resendApiKey: validated.resendApiKey,
        },
      },
    });

    return c.json({
      id: channel.id,
      channelType: channel.channelType,
      name: channel.name,
      service: channel.service,
      createdAt: channel.createdAt,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.issues }, 400);
    }
    return c.json({ error: 'Failed to create email channel' }, 500);
  }
});

alertChannels.get('/', async (c) => {
  try {
    const projectIdParam = c.req.query('projectId');
    if (!projectIdParam) {
      return c.json({ error: 'projectId is required' }, 400);
    }
    const projectId = parseInt(projectIdParam, 10);
    if (isNaN(projectId)) {
      return c.json({ error: 'Invalid projectId' }, 400);
    }

    const apiKey = c.get('apiKey');
    const service = c.req.query('service') || apiKey?.service || undefined;
    const channelType = c.req.query('type') as 'slack' | 'email' | undefined;

    const repository = new AlertChannelRepository();
    const channels = await repository.list(projectId, service, channelType);

    const safeChannels = channels.map((channel: AlertChannel) => ({
      id: channel.id,
      channelType: channel.channelType,
      name: channel.name,
      service: channel.service,
      active: channel.active,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
      config: channel.config,
    }));

    return c.json({ channels: safeChannels });
  } catch (error) {
    return c.json({ error: 'Failed to list alert channels' }, 500);
  }
});

alertChannels.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid channel ID' }, 400);
    }

    const repository = new AlertChannelRepository();
    await repository.delete(id);

    return c.json({ message: 'Alert channel deleted successfully' });
  } catch (error) {
    return c.json({ error: 'Failed to delete alert channel' }, 500);
  }
});

export default alertChannels;

