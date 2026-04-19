import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    const db = getDb();
    let query = `
      SELECT 
        r.*,
        w.name as workspace_name,
        t.title as task_title
      FROM replies r
      LEFT JOIN workspaces w ON r.workspace_id = w.id
      LEFT JOIN tasks t ON r.task_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (channel) {
      query += ' AND r.channel = ?';
      params.push(channel);
    }

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }

    query += ' ORDER BY r.created_at DESC LIMIT ?';
    params.push(limit);

    const replies = db.prepare(query).all(...params);

    return NextResponse.json({ replies });
  } catch (error) {
    console.error('Error fetching replies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch replies' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      channel,
      channelId,
      messageId,
      replyToMessageId,
      content,
      sender,
      senderId,
      workspaceId,
      taskId,
      threadId,
      priority = 'normal',
      status = 'pending',
      metadata = {},
    } = body;

    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO replies (
        id, channel, channel_id, message_id, reply_to_message_id,
        content, sender, sender_id, workspace_id, task_id, thread_id,
        priority, status, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      channel,
      channelId,
      messageId,
      replyToMessageId,
      content,
      sender,
      senderId,
      workspaceId,
      taskId,
      threadId,
      priority,
      status,
      JSON.stringify(metadata),
      now,
      now
    );

    return NextResponse.json({
      id,
      status: 'created',
      createdAt: now,
    });
  } catch (error) {
    console.error('Error creating reply:', error);
    return NextResponse.json(
      { error: 'Failed to create reply' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Reply ID required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, response, agentId } = body;

    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE replies
      SET status = ?, response = ?, agent_id = ?, updated_at = ?
      WHERE id = ?
    `).run(status, response, agentId, now, id);

    return NextResponse.json({ id, status: 'updated' });
  } catch (error) {
    console.error('Error updating reply:', error);
    return NextResponse.json(
      { error: 'Failed to update reply' },
      { status: 500 }
    );
  }
}
