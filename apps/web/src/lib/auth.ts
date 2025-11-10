'use client';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tracer_token');
}

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tracer_api_key');
}

export function getUser(): { id: number; email: string; name: string | null } | null {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem('tracer_user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('tracer_token');
  localStorage.removeItem('tracer_user');
  localStorage.removeItem('tracer_api_key');
  localStorage.removeItem('tracer_selected_project_id');
}


