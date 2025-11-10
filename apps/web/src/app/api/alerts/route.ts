import { NextResponse } from 'next/server';
import { AlertRepository, ApiKeyRepository } from '@tracer/db';
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
    const active = searchParams.get('active') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const apiKeyService = await getApiKeyFromRequest(request);
    const filteredService = apiKeyService || service || undefined;

    const alertRepository = new AlertRepository();

    let alerts;
    if (active) {
      alerts = await alertRepository.getActiveAlerts(filteredService);
    } else {
      alerts = await alertRepository.getRecentAlerts(limit, filteredService || undefined);
    }

    const alertsArray = await alerts;
    return NextResponse.json({ alerts: alertsArray });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
