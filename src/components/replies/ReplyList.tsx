'use client';

import { useState } from 'react';
import { 
  Check, 
  X, 
  Send, 
  Clock, 
  AlertCircle,
  MessageSquare,
  User,
  Calendar,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

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

interface ReplyListProps {
  replies: Reply[];
  onApprove: (id: string, response?: string) => void;
  onSend: (id: string) => void;
  showActions: boolean;
}

export function ReplyList({ replies, onApprove, onSend, showActions }: ReplyListProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editResponse, setEditResponse] = useState<Record<string, string>>({});

  function toggleExpand(id: string) {
    setExpanded(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'low': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'approved': return <Check className="w-4 h-4 text-blue-500" />;
      case 'sent': return <Send className="w-4 h-4 text-green-500" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (replies.length === 0) {
    return (
      <div className="text-center py-8 text-[#8a9bb0] border border-dashed border-[#30363d] rounded-xl">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
        No replies to show
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {replies.map((reply) => (
        <div 
          key={reply.id}
          className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden hover:border-[#e6c364]/30 transition-colors"
        >
          {/* Header Row */}
          <div 
            className="p-4 cursor-pointer"
            onClick={() => toggleExpand(reply.id)}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {expanded[reply.id] ? (
                  <ChevronDown className="w-4 h-4 text-[#8a9bb0]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#8a9bb0]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getStatusIcon(reply.status)}
                  <span className="font-medium text-[#e0e4e8] capitalize">{reply.channel}</span>
                  <span className="text-[#8a9bb0]">•</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${getPriorityColor(reply.priority)}`}>
                    {reply.priority}
                  </span>
                  {reply.workspaceName && (
                    <>
                      <span className="text-[#8a9bb0]">•</span>
                      <span className="text-sm text-[#8a9bb0]">{reply.workspaceName}</span>
                    </>
                  )}
                </div>

                <p className="text-sm text-[#c9d1d9] line-clamp-2">{reply.content}</p>

                <div className="mt-2 flex items-center gap-4 text-xs text-[#8a9bb0]">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {reply.sender}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(reply.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Expanded Content */}
          {expanded[reply.id] && (
            <div className="border-t border-[#30363d] px-4 py-4">
              {/* Original Message */}
              <div className="mb-4">
                <p className="text-xs font-medium text-[#8a9bb0] mb-2">Original Message</p>
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-sm text-[#c9d1d9]">
                  {reply.content}
                </div>
              </div>

              {/* Proposed Response */}
              {reply.response && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-[#8a9bb0] mb-2">Proposed Response</p>
                  <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-sm text-[#c9d1d9]">
                    {reply.response}
                  </div>
                </div>
              )}

              {/* Response Editor */}
              {showActions && reply.status === 'pending' && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-[#8a9bb0] mb-2">Edit Response</p>
                  <textarea
                    value={editResponse[reply.id] || reply.response || ''}
                    onChange={(e) => setEditResponse(prev => ({
                      ...prev,
                      [reply.id]: e.target.value,
                    }))}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-sm text-[#c9d1d9] focus:border-[#e6c364] focus:outline-none resize-none"
                    rows={3}
                    placeholder="Enter your response..."
                  />
                </div>
              )}

              {/* Task Context */}
              {reply.taskTitle && (
                <div className="mb-4 p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
                  <p className="text-xs text-[#8a9bb0]">Related Task: <span className="text-[#e6c364]">{reply.taskTitle}</span></p>
                </div>
              )}

              {/* Actions */}
              {showActions && reply.status === 'pending' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onApprove(reply.id, editResponse[reply.id] || reply.response || undefined)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#e6c364]/10 border border-[#e6c364]/30 text-[#e6c364] rounded-lg hover:bg-[#e6c364]/20 transition-colors text-sm font-medium"
                  >
                    <Check className="w-4 h-4" />
                    Approve
                  </button>
                  
                  <button
                    onClick={() => onSend(reply.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors text-sm font-medium"
                  >
                    <Send className="w-4 h-4" />
                    Approve & Send
                  </button>
                  
                  <button
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}

              {reply.status === 'approved' && (
                <button
                  onClick={() => onSend(reply.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors text-sm font-medium"
                >
                  <Send className="w-4 h-4" />
                  Send Now
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
