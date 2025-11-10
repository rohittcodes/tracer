'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LogOut, Home, Activity, FileText, AlertTriangle, GitBranch, Bot, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Chatbot } from '@/components/chatbot';
import { useProject } from '@/hooks/use-project';

interface NavbarProps {
  token?: string | null;
  apiKey?: string | null;
}

export function Navbar({ token, apiKey }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const { projects, selectedProject, selectedProjectId, switchProject, loading: projectsLoading } = useProject(token || null);

  const navItems = [
    { href: '/projects', label: 'Projects', icon: Home },
    { href: '/', label: 'Dashboard', icon: Activity },
    { href: '/services', label: 'Services', icon: Activity },
    { href: '/service-map', label: 'Service Map', icon: Activity },
    { href: '/logs', label: 'Logs', icon: FileText },
    { href: '/traces', label: 'Traces', icon: GitBranch },
    { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  ];

  const handleLogout = () => {
    localStorage.removeItem('tracer_token');
    localStorage.removeItem('tracer_user');
    router.push('/login');
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">Tracer</span>
            </div>
            {token && projects.length > 0 && (
              <div className="hidden md:flex items-center">
                <Select
                  value={selectedProjectId ? String(selectedProjectId) : undefined}
                  onValueChange={(value) => {
                    const projectId = parseInt(value, 10);
                    if (projectId !== selectedProjectId) {
                      switchProject(projectId);
                    }
                  }}
                  disabled={projectsLoading}
                >
                  <SelectTrigger className="w-[200px] gap-2">
                    <FolderOpen className="h-4 w-4" />
                    <SelectValue placeholder="Select project">
                      {selectedProject ? selectedProject.name : 'Select project'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={String(project.id)}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || 
                  (item.href !== '/' && pathname?.startsWith(item.href));
                return (
                  <Button
                    key={item.href}
                    variant={isActive ? 'secondary' : 'ghost'}
                    onClick={() => router.push(item.href)}
                    className={cn(
                      'gap-2',
                      isActive && 'bg-secondary'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setChatbotOpen(true)}
              size="sm"
              className="gap-2"
            >
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Assistant</span>
            </Button>
            <Button variant="outline" onClick={handleLogout} size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>
      {/* Mobile menu */}
      <div className="md:hidden border-t">
        <div className="px-4 py-2 space-y-1">
          {token && projects.length > 0 && (
            <div className="mb-2">
              <Select
                value={selectedProjectId ? String(selectedProjectId) : undefined}
                onValueChange={(value) => {
                  const projectId = parseInt(value, 10);
                  if (projectId !== selectedProjectId) {
                    switchProject(projectId);
                  }
                }}
                disabled={projectsLoading}
              >
                <SelectTrigger className="w-full gap-2">
                  <FolderOpen className="h-4 w-4" />
                  <SelectValue placeholder="Select project">
                    {selectedProject ? selectedProject.name : 'Select project'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname?.startsWith(item.href));
            return (
              <Button
                key={item.href}
                variant={isActive ? 'secondary' : 'ghost'}
                onClick={() => router.push(item.href)}
                className={cn(
                  'w-full justify-start gap-2',
                  isActive && 'bg-secondary'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </div>
      </div>
      <Chatbot open={chatbotOpen} onOpenChange={setChatbotOpen} apiKey={apiKey || null} />
    </nav>
  );
}

