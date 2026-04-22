'use client';

import { useState, useEffect } from 'react';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ArchivedProjectList } from '@/components/projects/ArchivedProjectList';
import { Loader2 } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'in_progress' | 'completed' | 'archived' | 'planning' | 'paused';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
  }[];
  deliverables: {
    name: string;
    path: string;
    type: 'pdf' | 'folder' | 'html' | 'image';
  }[];
  agent: string;
  totalTasks: number;
  completedTasks: number;
}

interface ProjectData {
  active: Project[];
  archived: Project[];
  totalCount: number;
}

export default function ProjectsPage() {
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#e6c364]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-red-400">
        Error loading projects: {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9]">
      {/* Header */}
      <header className="border-b border-[#30363d] bg-[#161b22]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#e6c364] mb-1">
                Mission Control
              </p>
              <h1 className="text-2xl font-bold text-[#e0e4e8]">Project Board</h1>
            </div>
            <div className="text-sm text-[#8a9bb0]">
              {data?.totalCount || 0} projects total
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Projects Column */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[#e0e4e8] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Active Projects
              </h2>
              <span className="text-sm text-[#8a9bb0]">
                {data?.active?.length || 0} projects
              </span>
            </div>

            <div className="space-y-4">
              {data?.active?.length === 0 ? (
                <div className="text-center py-12 text-[#8a9bb0] border border-dashed border-[#30363d] rounded-xl">
                  No active projects
                </div>
              ) : (
                data?.active?.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))
              )}
            </div>
          </div>

          {/* Archived Projects Column */}
          <div className="lg:col-span-1">
            <ArchivedProjectList projects={data?.archived || []} />
          </div>
        </div>
      </main>
    </div>
  );
}
