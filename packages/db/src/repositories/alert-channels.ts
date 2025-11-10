import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { alertChannels, NewAlertChannel, AlertChannel } from '../schema';

export class AlertChannelRepository {
  async create(data: {
    projectId: number;
    channelType: 'slack' | 'email';
    name?: string;
    service?: string;
    config: {
      slack?: {
        channel: string;
        accessToken?: string;
        webhookUrl?: string;
      };
      email?: {
        recipients: string[];
        fromEmail?: string;
        resendApiKey?: string;
      };
    };
  }): Promise<AlertChannel> {
    const db = getDb();
    
    const newChannel: NewAlertChannel = {
      projectId: data.projectId,
      channelType: data.channelType,
      name: data.name || null,
      service: data.service || null,
      active: true,
      config: data.config,
    };

    const result = await db.insert(alertChannels).values(newChannel).returning();
    if (!result || result.length === 0) {
      throw new Error('Failed to create alert channel: no result returned');
    }
    return result[0];
  }

  async list(projectId: number, service?: string, channelType?: 'slack' | 'email'): Promise<AlertChannel[]> {
    const db = getDb();
    
    const conditions = [eq(alertChannels.projectId, projectId)];
    if (service) {
      conditions.push(eq(alertChannels.service, service));
    }
    if (channelType) {
      conditions.push(eq(alertChannels.channelType, channelType));
    }
    conditions.push(eq(alertChannels.active, true));

    return await db
      .select()
      .from(alertChannels)
      .where(and(...conditions))
      .orderBy(alertChannels.createdAt);
  }

  async getById(id: number): Promise<AlertChannel | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(alertChannels)
      .where(eq(alertChannels.id, id))
      .limit(1);
    
    return result[0] || null;
  }

  async update(id: number, data: Partial<{
    name: string | null;
    service: string | null;
    active: boolean;
    config: any;
  }>): Promise<void> {
    const db = getDb();
    await db
      .update(alertChannels)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(alertChannels.id, id));
  }

  async delete(id: number): Promise<void> {
    const db = getDb();
    await db.delete(alertChannels).where(eq(alertChannels.id, id));
  }

  async deactivate(id: number): Promise<void> {
    const db = getDb();
    await db
      .update(alertChannels)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(alertChannels.id, id));
  }
}

