import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    
    // Debug: Check if we can query
    const testCount = db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number };
    console.log('[Projects API] Found', testCount.c, 'projects in DB');
    
    // Query projects directly from the projects table
    const projects = db.prepare(`
      SELECT 
        id,
        name,
        description,
        status,
        created_at as createdAt,
        updated_at as updatedAt,
        completed_at as completedAt,
        deliverables,
        agent
      FROM projects
      ORDER BY created_at DESC
    `).all() as ProjectRow[];

    // Transform deliverables from JSON string
    const transformedProjects = projects.map(p => ({
      ...p,
      deliverables: p.deliverables ? JSON.parse(p.deliverables) : [],
      tasks: [], // Projects don't have tasks in this model yet
      totalTasks: 0,
      completedTasks: p.status === 'completed' ? 1 : 0,
    }));

    // Split into active and archived
    const activeProjects = transformedProjects.filter(p => 
      p.status === 'in_progress' || p.status === 'planning'
    );
    
    const archivedProjects = transformedProjects
      .filter(p => p.status === 'completed' || p.status === 'archived')
      .sort((a, b) => {
        const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);

    return NextResponse.json({
      active: activeProjects,
      archived: archivedProjects,
      totalCount: transformedProjects.length,
    });
    
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deliverables: string;
  agent: string;
}
