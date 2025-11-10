import { z } from 'zod';
import { LogLevel } from '@tracer/core';

// Single log entry schema
export const logEntrySchema = z.object({
  timestamp: z.union([z.string().datetime(), z.date(), z.number()]).transform((val, ctx) => {
    if (typeof val === 'number') {
      return new Date(val);
    }
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }),
  level: z.nativeEnum(LogLevel),
  message: z.string().min(1),
  service: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Batch log entries schema
export const batchLogEntrySchema = z.object({
  logs: z.array(logEntrySchema).min(1).max(1000),
});

// Single log entry (for direct POST)
export const singleLogEntrySchema = logEntrySchema;

