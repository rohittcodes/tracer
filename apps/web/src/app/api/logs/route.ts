import { NextResponse } from 'next/server';
import { LogRepository, ApiKeyRepository } from '@tracer/db';
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
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    // Search parameters (from /search/logs endpoint)
    const query = searchParams.get('q'); // Search query
    const level = searchParams.get('level'); // Log level filter

    const apiKeyService = await getApiKeyFromRequest(request);
    const filteredService = apiKeyService || service || undefined;

    // If search parameters are provided, proxy to backend search endpoint
    // This keeps the Next.js API route simple and avoids complex query building
    if (query || level) {
      const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const authHeader = request.headers.get('Authorization');
      
      const searchParams = new URLSearchParams();
      if (filteredService) searchParams.append('service', filteredService);
      if (query) searchParams.append('q', query);
      if (level) searchParams.append('level', level);
      if (start) searchParams.append('start', start);
      if (end) searchParams.append('end', end);
      searchParams.append('limit', String(limit));
      
      const backendResponse = await fetch(`${BACKEND_API_URL}/search/logs?${searchParams.toString()}`, {
        headers: {
          'Authorization': authHeader || '',
          'Content-Type': 'application/json',
        },
      });
      
      if (!backendResponse.ok) {
        const error = await backendResponse.json().catch(() => ({ error: 'Unknown error' }));
        return NextResponse.json(
          { error: 'Failed to search logs', details: error.error || `HTTP ${backendResponse.status}` },
          { status: backendResponse.status }
        );
      }
      
      return NextResponse.json(await backendResponse.json());
    }

    // Standard log fetching (no search) - use Next.js API route (server-side)
    const logRepository = new LogRepository();
    let logs;
    if (start && end) {
      logs = await logRepository.queryByTimeRange(
        new Date(start),
        new Date(end),
        filteredService,
        limit
      );
    } else {
      // Use getRecentLogs for better performance when no time range is specified
      logs = await logRepository.getRecentLogs(filteredService, limit);
    }

    const logsArray = await logs;
    
    console.log(`Fetched ${logsArray.length} logs${filteredService ? ` for service: ${filteredService}` : ''}`);
    
    if (logsArray.length === 0) {
      console.log('No logs found. Make sure:');
      console.log('  1. Logs are being sent to the API (check processor logs)');
      console.log('  2. Processor is running and inserting logs to database');
      console.log('  3. Logs are within the time range (default: last 1 hour)');
      if (filteredService) {
        console.log(`  4. Service filter matches: ${filteredService}`);
      }
    }
    
    return NextResponse.json({ logs: logsArray });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
