const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface User {
  id: number;
  email: string;
  name: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Project {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: number;
  name: string | null;
  service: string | null;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export async function register(email: string, password: string, name?: string): Promise<AuthResponse> {
  const response = await fetch(`${BACKEND_API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Registration failed' }));
    throw new Error(error.error || 'Registration failed');
  }

  return response.json();
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${BACKEND_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }

  return response.json();
}

export async function getCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${BACKEND_API_URL}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get current user');
  }

  const data = await response.json();
  return data.user;
}

export async function fetchWithToken<T>(
  endpoint: string,
  token: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BACKEND_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    // Token expired or invalid
    localStorage.removeItem('tracer_token');
    localStorage.removeItem('tracer_user');
    throw new Error('Session expired. Please login again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Projects API
export async function getProjects(token: string): Promise<Project[]> {
  const data = await fetchWithToken<{ projects: Project[] }>('/projects', token);
  return data.projects;
}

export async function createProject(token: string, name: string, description?: string): Promise<Project> {
  const data = await fetchWithToken<{ project: Project }>('/projects', token, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
  return data.project;
}

export async function getProject(token: string, id: number): Promise<Project> {
  const data = await fetchWithToken<{ project: Project }>(`/projects/${id}`, token);
  return data.project;
}

export async function updateProject(token: string, id: number, name?: string, description?: string): Promise<Project> {
  const data = await fetchWithToken<{ project: Project }>(`/projects/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ name, description }),
  });
  return data.project;
}

export async function deleteProject(token: string, id: number): Promise<void> {
  await fetchWithToken(`/projects/${id}`, token, {
    method: 'DELETE',
  });
}

// API Keys API
export async function getApiKeys(token: string, projectId: number): Promise<ApiKey[]> {
  const data = await fetchWithToken<{ keys: ApiKey[] }>(`/api-keys?projectId=${projectId}`, token);
  return data.keys;
}

export async function createApiKey(
  token: string,
  projectId: number,
  name?: string,
  service?: string
): Promise<{ id: number; key: string; warning: string }> {
  const data = await fetchWithToken<{ id: number; key: string; warning: string }>('/api-keys', token, {
    method: 'POST',
    body: JSON.stringify({ projectId, name, service }),
  });
  return data;
}

export async function revokeApiKey(token: string, projectId: number, id: number): Promise<void> {
  await fetchWithToken(`/api-keys/${id}?projectId=${projectId}`, token, {
    method: 'DELETE',
  });
}


