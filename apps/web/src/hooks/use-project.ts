'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getProjects, getApiKeys, Project, ApiKey } from '@/lib/auth-client';

interface UseProjectReturn {
  projects: Project[];
  selectedProject: Project | null;
  selectedProjectId: number | null;
  apiKey: string | null;
  loading: boolean;
  error: string | null;
  switchProject: (projectId: number) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

export function useProject(token: string | null): UseProjectReturn {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await getProjects(token);
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadProjectApiKey = useCallback(async (projectId: number): Promise<string | null> => {
    if (!token) return null;

    // Check if we have a stored API key for this project
    const storedProjectId = localStorage.getItem('tracer_selected_project_id');
    const storedApiKey = localStorage.getItem('tracer_api_key');
    
    if (storedProjectId === String(projectId) && storedApiKey) {
      // Verify the key is still active by checking the project's API keys
      try {
        const keys = await getApiKeys(token, projectId);
        const activeKey = keys.find(k => k.active);
        if (activeKey) {
          // Key exists and is active - return stored key (we can't verify it's the same key,
          // but if it works, we'll use it. If it doesn't, user will need to create a new one)
          return storedApiKey;
        }
      } catch (err) {
        console.error('Failed to verify API key:', err);
      }
    }

    // No stored key for this project - return null (user needs to create one)
    return null;
  }, [token]);

  const switchProject = useCallback(async (projectId: number) => {
    if (!token) return;

    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Try to get an API key for this project
      const key = await loadProjectApiKey(projectId);
      
      if (!key) {
        // No API key found - check if project has any active keys
        try {
          const keys = await getApiKeys(token, projectId);
          const hasActiveKeys = keys.some(k => k.active);
          
          if (!hasActiveKeys) {
            // No active keys - redirect to project page to create one
            router.push(`/projects/${projectId}`);
            return;
          } else {
            // Has active keys but we don't have the value stored
            // Redirect to project page - user can copy an existing key or create new
            router.push(`/projects/${projectId}`);
            return;
          }
        } catch (err) {
          console.error('Failed to check API keys:', err);
          router.push(`/projects/${projectId}`);
          return;
        }
      }

      // Update localStorage
      localStorage.setItem('tracer_selected_project_id', String(projectId));
      localStorage.setItem('tracer_api_key', key);

      // Update state
      setSelectedProject(project);
      setSelectedProjectId(projectId);
      setApiKey(key);

      // Reload the page to refresh all data
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch project');
    }
  }, [token, projects, loadProjectApiKey, router]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      // Load selected project from localStorage
      const storedProjectId = localStorage.getItem('tracer_selected_project_id');
      const storedApiKey = localStorage.getItem('tracer_api_key');
      
      if (storedProjectId && storedApiKey) {
        const projectId = parseInt(storedProjectId, 10);
        const project = projects.find(p => p.id === projectId);
        if (project) {
          setSelectedProject(project);
          setSelectedProjectId(projectId);
          setApiKey(storedApiKey);
        } else {
          // Stored project doesn't exist anymore - clear it
          localStorage.removeItem('tracer_selected_project_id');
          localStorage.removeItem('tracer_api_key');
        }
      }
      // Don't auto-select - let user choose from dropdown
    }
  }, [projects, selectedProjectId]);

  return {
    projects,
    selectedProject,
    selectedProjectId,
    apiKey,
    loading,
    error,
    switchProject,
    refreshProjects: loadProjects,
  };
}

