import { Hono } from 'hono';
import { ObservabilityAIAgent, AIConfig } from '@tracer/ai';
import { TraceRepository, LogRepository, AlertRepository, MetricRepository, ApiKey } from '@tracer/db';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const ai = new Hono<{ Variables: Variables }>();

// Initialize repositories (shared across requests)
const traceRepository = new TraceRepository();
const logRepository = new LogRepository();
const alertRepository = new AlertRepository();
const metricRepository = new MetricRepository();

/**
 * Create AI agent instance
 */
function createAIAgent(includeToolRouter: boolean = false): ObservabilityAIAgent | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const composioKey = process.env.COMPOSIO_API_KEY;

  if (!openaiKey && !googleKey) {
    return null;
  }

  const provider = (process.env.AI_PROVIDER || (openaiKey ? 'openai' : 'google')) as 'openai' | 'google';
  const model = process.env.AI_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');

  const aiConfig: AIConfig = {
    provider,
    model: model as any,
    apiKey: provider === 'openai' ? openaiKey : googleKey,
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000', 10),
  };

  return new ObservabilityAIAgent({
    ai: aiConfig,
    composio: includeToolRouter && composioKey ? {
      apiKey: composioKey,
      userId: process.env.COMPOSIO_USER_ID || 'tracer-system',
      toolkits: (process.env.COMPOSIO_TOOLKITS || 'slack,gmail,github,microsoft_teams').split(','),
    } : undefined,
    repositories: {
      traceRepository,
      logRepository,
      alertRepository,
      metricRepository,
    },
  });
}

/**
 * POST /ai/chat - Natural language query interface
 * Supports both single query string and message array (for conversation history)
 */
ai.post('/chat', async (c) => {
  try {
    let body: any;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const { query, messages, includeToolRouter, maxSteps } = body;

    // Support both single query string and message array (following docs pattern)
    if (!query && !messages) {
      return c.json({ error: 'query string or messages array is required' }, 400);
    }

    const agent = createAIAgent(includeToolRouter === true);
    if (!agent) {
      return c.json(
        { error: 'AI features not configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY' },
        503
      );
    }

    // Use messages array if provided, otherwise use query string
    const queryOrMessages = messages || query;

    const result = await agent.analyze(queryOrMessages, {
      includeToolRouter: includeToolRouter === true,
      maxSteps: maxSteps || 10,
    });

    // Stream the response using toUIMessageStreamResponse (following docs pattern)
    return result.toUIMessageStreamResponse();
  } catch (error) {
    logger.error({ error }, 'AI chat error');
    return c.json(
      { error: 'Failed to process query', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * GET /ai/trace/:traceId/root-cause - Analyze trace for root cause
 */
ai.get('/trace/:traceId/root-cause', async (c) => {
  const traceId = c.req.param('traceId');
  try {
    const agent = createAIAgent();
    if (!agent) {
      return c.json(
        { error: 'AI features not configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY' },
        503
      );
    }

    const analysis = await agent.analyzeTraceRootCause(traceId);

    return c.json({
      traceId,
      analysis,
    });
  } catch (error) {
    logger.error({ error, traceId }, 'Root cause analysis error');
    return c.json(
      { error: 'Failed to analyze root cause', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * GET /ai/logs/:service/summarize - Summarize logs for a service
 */
ai.get('/logs/:service/summarize', async (c) => {
  try {
    const service = c.req.param('service');
    const hoursParam = c.req.query('hours') || '1';
    const timeWindowHours = parseInt(hoursParam, 10);
    if (isNaN(timeWindowHours) || timeWindowHours < 1 || timeWindowHours > 168) {
      return c.json({ error: 'Invalid hours parameter. Must be a number between 1 and 168 (7 days)' }, 400);
    }

    const agent = createAIAgent();
    if (!agent) {
      return c.json(
        { error: 'AI features not configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY' },
        503
      );
    }

    const summary = await agent.summarizeLogs(service, timeWindowHours);

    return c.json({
      service,
      timeWindowHours,
      summary,
    });
  } catch (error) {
    const service = c.req.param('service');
    logger.error({ error, service }, 'Log summarization error');
    return c.json(
      { error: 'Failed to summarize logs', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default ai;
