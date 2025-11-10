import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TracerClient } from './client';
import { LogLevel } from '@tracer/core';

// Mock fetch
global.fetch = vi.fn();

describe('TracerClient', () => {
  let client: TracerClient;
  const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ accepted: 1, rejected: 0 }),
    } as Response);

    client = new TracerClient({
      service: 'test-service',
      apiUrl: 'http://localhost:3000',
      batchSize: 3,
      flushInterval: 5000,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await client.shutdown();
  });

  it('should create a TracerClient instance', () => {
    expect(client).toBeInstanceOf(TracerClient);
  });

  it('should buffer logs without sending immediately', () => {
    client.info('Test message');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should send logs when batch size is reached', async () => {
    client.info('Message 1');
    client.info('Message 2');
    client.info('Message 3'); // Should trigger flush

    await vi.runAllTimersAsync();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('http://localhost:3000/logs');
    expect(call[1]?.method).toBe('POST');
    expect(call[1]?.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(call[1]?.body as string);
    expect(body.logs).toHaveLength(3);
  });

  it('should support all log levels', () => {
    client.debug('Debug message');
    client.info('Info message');
    client.warn('Warn message');
    client.error('Error message');
    client.fatal('Fatal message');

    // All should be buffered
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should include metadata in logs', async () => {
    const metadata = { userId: '123', action: 'login' };
    client.info('User logged in', metadata);

    client.info('Message 2');
    client.info('Message 3'); // Trigger flush

    await vi.runAllTimersAsync();

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.logs[0].metadata).toEqual(metadata);
  });

  it('should flush logs manually', async () => {
    client.info('Test message');
    await client.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should auto-flush at intervals', async () => {
    client.info('Test message');
    
    // Fast-forward time
    vi.advanceTimersByTime(5000);

    await vi.runAllTimersAsync();

    expect(mockFetch).toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    client.info('Test message');
    
    await expect(client.flush()).rejects.toThrow();
  });

  it('should flush remaining logs on shutdown', async () => {
    client.info('Message 1');
    client.info('Message 2');

    await client.shutdown();

    expect(mockFetch).toHaveBeenCalled();
  });
});

