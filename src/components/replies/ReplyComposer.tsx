'use client';

import { useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';

interface ReplyComposerProps {
  onSent?: () => void;
}

export function ReplyComposer({ onSent }: ReplyComposerProps) {
  const [channel, setChannel] = useState('telegram');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('normal');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }

    setSending(true);
    setError('');

    try {
      console.log('Sending reply:', {
        channel,
        recipient,
        message,
        priority,
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      setMessage('');
      setRecipient('');
      onSent?.();
    } catch (err) {
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  const channels = [
    { value: 'telegram', label: 'Telegram', color: '#0088cc' },
    { value: 'discord', label: 'Discord', color: '#5865F2' },
    { value: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
    { value: 'email', label: 'Email', color: '#EA4335' },
    { value: 'signal', label: 'Signal', color: '#3A76F0' },
  ];

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <div className="mb-4">
        <label className="block text-sm font-medium text-[#8a9bb0] mb-2">Channel</label>
        <div className="flex flex-wrap gap-2">
          {channels.map((ch) => (
            <button
              key={ch.value}
              onClick={() => setChannel(ch.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                channel === ch.value
                  ? 'bg-[#e6c364]/20 text-[#e6c364] border border-[#e6c364]/50'
                  : 'bg-[#0d1117] text-[#8a9bb0] border border-[#30363d] hover:border-[#e6c364]/30'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-[#8a9bb0] mb-2">
          Recipient {channel === 'telegram' && '(Chat ID)'}
          {channel === 'email' && '(Email Address)'}
          {channel === 'discord' && '(Channel ID)'}
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-sm text-[#c9d1d9] focus:border-[#e6c364] focus:outline-none"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-[#8a9bb0] mb-2">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          rows={4}
          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3 text-sm text-[#c9d1d9] focus:border-[#e6c364] focus:outline-none resize-none"
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={sending}
        className="flex items-center gap-2 px-6 py-2.5 bg-[#e6c364] text-[#0d1117] rounded-lg font-medium hover:bg-[#d4b44c] disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        Queue Reply
      </button>
    </div>
  );
}
