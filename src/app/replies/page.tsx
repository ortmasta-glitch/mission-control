'use client';

import { useState, useEffect } from 'react';
import { ReplyList } from '@/components/replies/ReplyList';
import { ReplyComposer } from '@/components/replies/ReplyComposer';
import { Loader2, MessageSquare, Send } from 'lucide-react';

interface Reply {
  id: string;
  channel: string;
  channelId: string;
  messageId: string;
  replyToMessageId: string | null;
  content: string;
  response: string | null;
  sender: string;
  senderId: string;
  status: 'pending' | 'approved' | 'sent' | 'failed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  workspaceName: string | null;
  taskTitle: string | null;
  createdAt: string;
}

export default function RepliesPage() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');

  useEffect(() => {
    fetchReplies();
  }, [selectedChannel, selectedStatus]);

  async function fetchReplies() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedChannel !== 'all') params.append('channel', selectedChannel);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      params.append('limit', '50');

      const res = await fetch(`/api/replies?${params}`);
      if (!res.ok) throw new Error('Failed to fetch replies');
      const data = await res.json();
      setReplies(data.replies || []);
    } catch (error) {
      console.error('Error fetching replies:', error);
    } finally {
      setLoading(false);
    }
  }

  async function approveReply(id: string, response?: string) {
    try {
      const res = await fetch(`/api/replies?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', response }),
      });
      if (res.ok) {
        fetchReplies();
      }
    } catch (error) {
      console.error('Error approving reply:', error);
    }
  }

  async function sendReply(id: string) {
    try {
      // This would trigger the actual send via the appropriate channel
      const res = await fetch(`/api/replies?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });
      if (res.ok) {
        fetchReplies();
      }
    } catch (error) {
      console.error('Error sending reply:', error);
    }
  }

  const channelOptions = [
    { value: 'all', label: 'All Channels' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'discord', label: 'Discord' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'email', label: 'Email' },
    { value: 'signal', label: 'Signal' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending Approval' },
    { value: 'approved', label: 'Approved' },
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
  ];

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
              <h1 className="text-2xl font-bold text-[#e0e4e8] flex items-center gap-2">
                <MessageSquare className="w-6 h-6" />
                Reply Center
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#8a9bb0]">
                {replies.filter(r => r.status === 'pending').length} pending
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm focus:border-[#e6c364] focus:outline-none"
          >
            {channelOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm focus:border-[#e6c364] focus:outline-none"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Reply List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending Replies */}
          <div>
            <h2 className="text-lg font-semibold text-[#e0e4e8] mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Pending Approval
            </h2>
            
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#e6c364]" />
              </div>
            ) : (
              <ReplyList
                replies={replies.filter(r => r.status === 'pending')}
                onApprove={approveReply}
                onSend={sendReply}
                showActions={true}
              />
            )}
          </div>

          {/* Recent Sent */}
          <div>
            <h2 className="text-lg font-semibold text-[#e0e4e8] mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-green-500" />
              Recently Sent
            </h2>
            
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#e6c364]" />
              </div>
            ) : (
              <ReplyList
                replies={replies.filter(r => r.status === 'sent').slice(0, 10)}
                onApprove={approveReply}
                onSend={sendReply}
                showActions={false}
              />
            )}
          </div>
        </div>

        {/* Quick Composer */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[#e0e4e8] mb-4">Quick Reply Composer</h2>
          <ReplyComposer onSent={fetchReplies} />
        </div>
      </main>
    </div>
  );
}
