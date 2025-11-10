import { NextResponse } from 'next/server';
import { MetricRepository, ApiKeyRepository } from '@tracer/db';
import { loadEnv } from '../../../lib/env';

loadEnv();

export const dynamic = 'force-dynamic';

async function getApiKeyFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2) return null;
  
  const [scheme, key] = parts;
  if (scheme !== 'Bearer' && scheme !== 'ApiKey') return null;
  
  const apiKeyRepository = new ApiKeyRepository();
  const apiKey = await apiKeyRepository.validate(key);
  return apiKey?.service || null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const apiKeyService = await getApiKeyFromRequest(request);
    const filteredService = apiKeyService || service || undefined;

    const metricRepository = new MetricRepository();
    const metrics = await metricRepository.getLatestMetrics(filteredService, limit);

    const metricsArray = await metrics;
    
    if (metricsArray.length === 0) {
      console.log('No metrics found. Metrics are generated after 60-second time windows complete.');
      console.log('Make sure:');
      console.log('  1. Logs are being sent to the API');
      console.log('  2. Processor is running and aggregating metrics');
      console.log('  3. At least 60 seconds have passed since logs started');
    }
    
    return NextResponse.json({ metrics: metricsArray });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
