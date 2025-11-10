import { Hono } from 'hono';
import { TraceRepository, ApiKey } from '@tracer/db';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const serviceMap = new Hono<{ Variables: Variables }>();

/**
 * GET /service-map - Get service dependency graph
 */
serviceMap.get('/', async (c) => {
  const apiKey = c.get('apiKey');
  const hoursParam = c.req.query('hours') || '24';
  const hours = parseInt(hoursParam, 10);
  if (isNaN(hours) || hours < 1 || hours > 720) {
    return c.json({ error: 'Invalid hours parameter. Must be a number between 1 and 720 (30 days)' }, 400);
  }
  try {

    const traceRepository = new TraceRepository();
    const dependencies = await traceRepository.getServiceDependencies(hours);

    // Filter by service if API key has one
    let filteredDependencies = dependencies;
    if (apiKey?.service) {
      filteredDependencies = dependencies.filter(
        dep => dep.from === apiKey.service || dep.to === apiKey.service
      );
    }

    // Get all unique services
    const services = new Set<string>();
    filteredDependencies.forEach(dep => {
      services.add(dep.from);
      services.add(dep.to);
    });

    // Build service map data structure
    const serviceMapData = {
      services: Array.from(services).map(service => ({
        name: service,
        // Calculate service health from dependencies
        totalCalls: filteredDependencies
          .filter(d => d.from === service)
          .reduce((sum, d) => sum + d.callCount, 0),
        totalErrors: filteredDependencies
          .filter(d => d.from === service)
          .reduce((sum, d) => sum + d.errorCount, 0),
        avgLatency: filteredDependencies
          .filter(d => d.from === service)
          .reduce((sum, d) => sum + d.avgDuration, 0) / 
          filteredDependencies.filter(d => d.from === service).length || 0,
      })),
      dependencies: filteredDependencies,
    };

    return c.json(serviceMapData);
  } catch (error) {
    logger.error({ error, hours }, 'Error fetching service map');
    return c.json(
      { error: 'Failed to fetch service map', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default serviceMap;

