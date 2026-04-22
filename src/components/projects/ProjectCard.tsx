'use client';

import { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  FolderOpen, 
  FileText, 
  ChevronDown, 
  ChevronRight,
  User,
  Calendar,
  ExternalLink,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';

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

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusColors = {
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    archived: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    planning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    paused: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };

  const statusLabels = {
    in_progress: 'In Progress',
    completed: 'Completed',
    archived: 'Archived',
    planning: 'Planning',
    paused: 'Paused',
  };

  // Traffic light calculation based on project health
  function getTrafficLight() {
    // For active projects, determine health based on various factors
    if (project.status === 'completed') {
      return { color: 'green', icon: CheckCircle2, label: 'Complete' };
    }
    
    if (project.status === 'paused') {
      return { color: 'red', icon: AlertCircle, label: 'Blocked' };
    }
    
    if (project.status === 'planning') {
      return { color: 'amber', icon: Clock, label: 'Planning' };
    }
    
    // Calculate days since update
    const daysSinceUpdate = Math.floor(
      (new Date().getTime() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Red: No activity for 7+ days
    if (daysSinceUpdate >= 7) {
      return { color: 'red', icon: AlertCircle, label: 'Stale' };
    }
    
    // Amber: No activity for 3+ days
    if (daysSinceUpdate >= 3) {
      return { color: 'amber', icon: AlertTriangle, label: 'Warning' };
    }
    
    // Green: Active within 3 days
    return { color: 'green', icon: CheckCircle2, label: 'On Track' };
  }

  const trafficLight = getTrafficLight();
  const TrafficIcon = trafficLight.icon;

  const completionPercent = project.totalTasks 
    ? Math.round((project.completedTasks / project.totalTasks) * 100) 
    : 0;

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function openDeliverable(path: string) {
    // Convert local paths to file:// URLs
    const fullPath = path.startsWith('/') 
      ? `file:///Users/tomaszzagala/.openclaw/workspace${path}`
      : path;
    window.open(fullPath, '_blank');
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden hover:border-[#e6c364]/30 transition-colors">
      {/* Card Header */}
      <div 
        className="p-6 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {/* Traffic Light */}
              <div className={`w-3 h-3 rounded-full ${
                trafficLight.color === 'green' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                trafficLight.color === 'amber' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' :
                'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
              }`} title={trafficLight.label} />
              
              <h3 className="text-lg font-semibold text-[#e0e4e8]">{project.name}</h3>
              
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${statusColors[project.status]}`}>
                {statusLabels[project.status]}
              </span>
              
              {/* Traffic Light Label */}
              <span className={`text-xs flex items-center gap-1 ${
                trafficLight.color === 'green' ? 'text-green-400' :
                trafficLight.color === 'amber' ? 'text-amber-400' :
                'text-red-400'
              }`}>
                <TrafficIcon className="w-3.5 h-3.5" />
                {trafficLight.label}
              </span>
            </div>
            
            <p className="text-sm text-[#8a9bb0] mb-4 line-clamp-2">
              {project.description}
            </p>

            {/* Stats Row */}
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-[#8a9bb0]">
                <User className="w-4 h-4" />
                <span>{project.agent}</span>
              </div>
              
              <div className="flex items-center gap-2 text-[#8a9bb0]">
                <Calendar className="w-4 h-4" />
                <span>Started {formatDate(project.createdAt)}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#e6c364]" />
                <span className="text-[#e6c364]">
                  {project.completedTasks}/{project.totalTasks} tasks
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#e6c364] to-[#f0d77a] rounded-full transition-all"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-[#8a9bb0] text-right">{completionPercent}% complete</div>
            </div>
          </div>

          <button className="p-2 hover:bg-[#21262d] rounded-lg transition-colors">
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-[#8a9bb0]" />
            ) : (
              <ChevronRight className="w-5 h-5 text-[#8a9bb0]" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-[#30363d] px-6 py-4">
          {/* Deliverables Section */}
          {project.deliverables.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-[#e0e4e8] mb-3 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#e6c364]" />
                Generated Documents
              </h4>
              <div className="grid gap-2">
                {project.deliverables.map((deliverable, idx) => (
                  <button
                    key={idx}
                    onClick={() => openDeliverable(deliverable.path)}
                    className="flex items-center gap-3 p-3 bg-[#0d1117] border border-[#30363d] rounded-lg hover:border-[#e6c364]/50 hover:bg-[#21262d] transition-colors text-left group"
                  >
                    <FileText className="w-4 h-4 text-[#8a9bb0] group-hover:text-[#e6c364]" />
                    <span className="flex-1 text-sm text-[#c9d1d9]">{deliverable.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#8a9bb0] opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tasks Section */}
          {project.tasks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-[#e0e4e8] mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#e6c364]" />
                Tasks ({project.tasks.length})
              </h4>
              <div className="space-y-2">
                {project.tasks.slice(0, 5).map((task) => (
                  <div 
                    key={task.id}
                    className="flex items-center gap-3 p-2.5 bg-[#0d1117] rounded-lg"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      task.status === 'done' ? 'bg-green-500' : 
                      task.status === 'in_progress' ? 'bg-blue-500' : 
                      'bg-gray-500'
                    }`} />
                    <span className="flex-1 text-sm text-[#c9d1d9] truncate">{task.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      task.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                      task.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                ))}
                {project.tasks.length > 5 && (
                  <div className="text-center text-sm text-[#8a9bb0] py-2">
                    +{project.tasks.length - 5} more tasks
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
