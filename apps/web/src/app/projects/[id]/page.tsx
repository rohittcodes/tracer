'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Key, Copy, Check, Trash2, Plus } from 'lucide-react';
import { getProject, getApiKeys, createApiKey, revokeApiKey, Project, ApiKey } from '@/lib/auth-client';
import { Navbar } from '@/components/navbar';

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = parseInt(params.id as string, 10);
  
  const [token, setToken] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUseKeyForm, setShowUseKeyForm] = useState(false);
  const [apiKeyName, setApiKeyName] = useState('');
  const [existingApiKey, setExistingApiKey] = useState('');
  const [newApiKey, setNewApiKey] = useState<{ id: number; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('tracer_token');
    if (!storedToken) {
      router.push('/login');
      return;
    }

    setToken(storedToken);
    loadProject(storedToken);
    loadApiKeys(storedToken);
  }, [router, projectId]);

  const loadProject = async (authToken: string) => {
    try {
      const data = await getProject(authToken, projectId);
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const loadApiKeys = async (authToken: string) => {
    try {
      const data = await getApiKeys(authToken, projectId);
      setApiKeys(data);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setError('');

    try {
      const result = await createApiKey(token, projectId, apiKeyName.trim() || undefined);
      setNewApiKey({ id: result.id, key: result.key });
      setApiKeyName('');
      setShowCreateForm(false);
      await loadApiKeys(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    }
  };

  const handleCopyKey = async () => {
    if (newApiKey?.key) {
      await navigator.clipboard.writeText(newApiKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      // Store API key for dashboard use
      localStorage.setItem('tracer_api_key', newApiKey.key);
      localStorage.setItem('tracer_selected_project_id', String(projectId));
      
      // Redirect to dashboard after copying
      setTimeout(() => {
        router.push('/');
      }, 2000);
    }
  };

  const handleUseExistingKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingApiKey.trim()) return;

    // Store the API key and redirect to dashboard
    localStorage.setItem('tracer_api_key', existingApiKey.trim());
    localStorage.setItem('tracer_selected_project_id', String(projectId));
    setExistingApiKey('');
    setShowUseKeyForm(false);
    router.push('/');
  };

  const handleRevokeKey = async (id: number) => {
    if (!token || !confirm('Are you sure you want to revoke this API key? It will stop working immediately.')) {
      return;
    }

    try {
      await revokeApiKey(token, projectId, id);
      await loadApiKeys(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  if (loading) {
    return (
      <>
        <Navbar token={token} apiKey={null} />
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12">Loading project...</div>
          </div>
        </div>
      </>
    );
  }

  if (!token || !project) {
    return null;
  }

  return (
    <>
      <Navbar token={token} />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <Button variant="ghost" onClick={() => router.push('/projects')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>

          <div className="mb-8">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {project.description && (
              <p className="text-gray-600 mt-2">{project.description}</p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {newApiKey && (
            <Card className="mb-6 border-green-500 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800">API Key Created!</CardTitle>
                <CardDescription className="text-green-700">
                  Store this key securely. You won't be able to see it again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={newApiKey.key}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button onClick={handleCopyKey} size="sm">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewApiKey(null);
                      setShowCreateForm(false);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">API Keys</h2>
              {!newApiKey && !showCreateForm && !showUseKeyForm && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowUseKeyForm(true)}>
                    Use Existing Key
                  </Button>
                  <Button onClick={() => setShowCreateForm(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Generate API Key
                  </Button>
                </div>
              )}
            </div>

            {showUseKeyForm && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Use Existing API Key</CardTitle>
                  <CardDescription>Paste an existing API key to use it for this project</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUseExistingKey} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="existingApiKey">API Key</Label>
                      <Input
                        id="existingApiKey"
                        type="password"
                        value={existingApiKey}
                        onChange={(e) => setExistingApiKey(e.target.value)}
                        placeholder="Paste your API key here"
                        required
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit">Use Key</Button>
                      <Button type="button" variant="outline" onClick={() => {
                        setShowUseKeyForm(false);
                        setExistingApiKey('');
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {showCreateForm && !newApiKey && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Create API Key</CardTitle>
                  <CardDescription>Generate a new API key for this project</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateApiKey} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="apiKeyName">Name (Optional)</Label>
                      <Input
                        id="apiKeyName"
                        value={apiKeyName}
                        onChange={(e) => setApiKeyName(e.target.value)}
                        placeholder="My API Key"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit">Generate Key</Button>
                      <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {apiKeys.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
                  <p className="text-gray-600 mb-4">Generate an API key to start sending data to Tracer</p>
                  <Button onClick={() => setShowCreateForm(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Generate API Key
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {apiKeys.map((key) => (
                  <Card key={key.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{key.name || 'Unnamed Key'}</h3>
                            <Badge variant={key.active ? 'default' : 'secondary'}>
                              {key.active ? 'Active' : 'Revoked'}
                            </Badge>
                          </div>
                          {key.service && (
                            <p className="text-sm text-gray-600 mb-2">Service: {key.service}</p>
                          )}
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>Created: {new Date(key.createdAt).toLocaleString()}</p>
                            {key.lastUsedAt && (
                              <p>Last used: {new Date(key.lastUsedAt).toLocaleString()}</p>
                            )}
                            {key.expiresAt && (
                              <p>Expires: {new Date(key.expiresAt).toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                        {key.active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevokeKey(key.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Revoke
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

