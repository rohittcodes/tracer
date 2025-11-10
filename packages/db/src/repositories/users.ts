import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users, NewUser, User } from '../schema';
import bcrypt from 'bcrypt';

export class UserRepository {
  async create(data: {
    email: string;
    password: string;
    name?: string;
  }): Promise<User> {
    const db = getDb();
    
    // Check if user already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);
    
    if (existing.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(data.password, saltRounds);

    const newUser: NewUser = {
      email: data.email,
      passwordHash,
      name: data.name || null,
    };

    const result = await db.insert(users).values(newUser).returning();
    if (!result || result.length === 0) {
      throw new Error('Failed to create user: no result returned');
    }
    return result[0];
  }

  async findByEmail(email: string): Promise<User | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  async findById(id: number): Promise<User | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.passwordHash);
  }

  async update(id: number, data: Partial<Pick<User, 'name' | 'email'>>): Promise<User> {
    const db = getDb();
    const result = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    
    if (!result || result.length === 0) {
      throw new Error('Failed to update user: no result returned');
    }
    return result[0];
  }
}


