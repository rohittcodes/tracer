import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db';
import { apiKeys, NewApiKey, ApiKey } from '../schema';
import crypto from 'crypto';

export class ApiKeyRepository {
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  generateKey(): { key: string; hash: string } {
    const key = crypto.randomBytes(32).toString('hex');
    const hash = this.hashKey(key);
    return { key, hash };
  }

  async create(data: {
    projectId: number;
    name?: string;
    service?: string;
    expiresAt?: Date;
  }): Promise<{ id: number; key: string }> {
    const db = getDb();
    const { key, hash } = this.generateKey();

    const newApiKey: NewApiKey = {
      projectId: data.projectId,
      keyHash: hash,
      name: data.name || null,
      service: data.service || null,
      active: true,
      expiresAt: data.expiresAt || null,
    };

    const result = await db.insert(apiKeys).values(newApiKey).returning({ id: apiKeys.id });
    if (!result || result.length === 0) {
      throw new Error('Failed to create API key: no result returned');
    }
    return { id: result[0].id, key };
  }

  async validate(key: string): Promise<ApiKey | null> {
    const db = getDb();
    const hash = this.hashKey(key);

    const result = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, hash),
          eq(apiKeys.active, true)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const apiKey = result[0];

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return null;
    }

    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, apiKey.id));

    return apiKey;
  }

  async list(projectId: number, service?: string): Promise<ApiKey[]> {
    const db = getDb();
    
    if (service) {
      return await db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.projectId, projectId),
            eq(apiKeys.service, service)
          )
        )
        .orderBy(apiKeys.createdAt);
    }

    return await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.projectId, projectId))
      .orderBy(apiKeys.createdAt);
  }

  async findByProject(projectId: number): Promise<ApiKey | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.projectId, projectId),
          eq(apiKeys.active, true)
        )
      )
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  async revoke(id: number, projectId: number): Promise<void> {
    const db = getDb();
    await db
      .update(apiKeys)
      .set({ active: false })
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.projectId, projectId)
        )
      );
  }

  async delete(id: number, projectId: number): Promise<void> {
    const db = getDb();
    await db
      .delete(apiKeys)
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.projectId, projectId)
        )
      );
  }

  /**
   * Find projectId for a service by looking at recently used API keys
   * Returns the most recently used projectId for the service, or null if not found
   */
  async findProjectIdByService(service: string): Promise<number | null> {
    const db = getDb();
    const result = await db
      .select({ projectId: apiKeys.projectId })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.service, service),
          eq(apiKeys.active, true)
        )
      )
      .orderBy(desc(apiKeys.lastUsedAt))
      .limit(1);
    
    return result.length > 0 ? result[0].projectId : null;
  }
}

