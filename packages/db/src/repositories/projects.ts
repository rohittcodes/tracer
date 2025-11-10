import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { projects, NewProject, Project } from '../schema';

export class ProjectRepository {
  async create(data: {
    userId: number;
    name: string;
    description?: string;
  }): Promise<Project> {
    const db = getDb();

    const newProject: NewProject = {
      userId: data.userId,
      name: data.name,
      description: data.description || null,
    };

    const result = await db.insert(projects).values(newProject).returning();
    if (!result || result.length === 0) {
      throw new Error('Failed to create project: no result returned');
    }
    return result[0];
  }

  async findById(id: number, userId: number): Promise<Project | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.userId, userId)
        )
      )
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Find project by ID without userId check (for internal use, e.g., alert handler)
   */
  async findByIdInternal(id: number): Promise<Project | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  async list(userId: number): Promise<Project[]> {
    const db = getDb();
    return await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(projects.createdAt);
  }

  async update(id: number, userId: number, data: Partial<Pick<Project, 'name' | 'description'>>): Promise<Project> {
    const db = getDb();
    const result = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(projects.id, id),
          eq(projects.userId, userId)
        )
      )
      .returning();
    
    if (!result || result.length === 0) {
      throw new Error('Failed to update project: no result returned');
    }
    return result[0];
  }

  async delete(id: number, userId: number): Promise<void> {
    const db = getDb();
    await db
      .delete(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.userId, userId)
        )
      );
  }
}


