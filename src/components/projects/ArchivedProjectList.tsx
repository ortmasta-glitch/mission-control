'use client';

import { useState } from 'react';
import { Archive, ChevronDown, ChevronRight, FileText, CheckCircle2 } from 'lucide-react';

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

interface ArchivedProjectListProps {
  projects: Project[];
}

export function ArchivedProjectList({ projects }: ArchivedProjectListProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggleProject(id: string) {
    setExpanded(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function openDeliverable(path: string) {
    const fullPath = path.startsWith('/') 
      ? `file:///Users/tomaszzagala/.openclaw/workspace${path}`
      : path;
    window.open(fullPath, '_blank');
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="flex items-center gap-2">
          <Archive className="w-5 h-5 text-[#8a9bb0]" />
          <h2 className="font-semibold text-[#e0e4e8]">Archived Projects</h2>
          <span className="ml-auto text-sm text-[#8a9bb0]">{projects.length}</span>
        </div>
        <p className="mt-1 text-xs text-[#8a9bb0]">
          Last 10 completed projects
        </p>
      </div>

      {/* Project List */}
      <div className="divide-y divide-[#30363d]">
        {projects.length === 0 ? (
          <div className="p-6 text-center text-[#8a9bb0] text-sm">
            No archived projects yet
          </div>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="p-4 hover:bg-[#21262d]/50 transition-colors">
              {/* Project Summary */}
              <button
                onClick={() => toggleProject(project.id)}
                className="w-full flex items-start gap-3 text-left"
              >
                <div className="mt-0.5">
                  {expanded[project.id] ? (
                    <ChevronDown className="w-4 h-4 text-[#8a9bb0]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#8a9bb0]" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-[#e0e4e8] truncate">
                      {project.name}
                    </span>
                  </div>
                  
                  <div className="mt-1 flex items-center gap-4 text-xs text-[#8a9bb0]">
                    <span>Completed {formatDate(project.completedAt || project.updatedAt)}</span>
                    <span>•</span>
                    <span>{project.deliverables.length} docs</span>
                  </div>
                </div>
              </button>

              {/* Expanded Content */}
              {expanded[project.id] && (
                <div className="mt-3 ml-7 pl-3 border-l-2 border-[#30363d]">
                  <p className="text-sm text-[#8a9bb0] mb-3">
                    {project.description}
                  </p>

                  {/* Deliverables */}
                  {project.deliverables.length > 0 && (
                    <div className="space-y-1">
                      {project.deliverables.map((deliverable, idx) => (
                        <button
                          key={idx}
                          onClick={() => openDeliverable(deliverable.path)}
                          className="flex items-center gap-2 text-sm text-[#8a9bb0] hover:text-[#e6c364] transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="truncate">{deliverable.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Task Summary */}
                  <div className="mt-3 text-xs text-[#8a9bb0]">
                    <span className="text-[#e6c364]">{project.completedTasks}/{project.totalTasks}</span> tasks completed
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
