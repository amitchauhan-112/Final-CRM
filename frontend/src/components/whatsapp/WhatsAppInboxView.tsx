import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, AlertTriangle, Check, CheckCheck, Clock } from 'lucide-react';
import {
  useWhatsAppConversations, useWhatsAppMessages, useSendWhatsAppMessage,
  WhatsAppConversationSummary, WhatsAppMessage,
} from '../../hooks/useWhatsAppConversations';
import { useAuthStore } from '../../store/authStore';
import Avatar from '../ui/Avatar';
import { cn, formatRelativeTime } from '../../utils/helpers';
import toast from 'react-hot-toast';

function ConversationRow({ conversation, active, onClick }: {
  conversation: WhatsAppConversationSummary;
  active: boolean;
  onClick: () => void;
}) {
  const { user } = useAuthStore();
  const label = conversation.lead?.name ?? conversation.customerPhone;
  const lastActivity = conversation.lastInboundAt ?? conversation.lastOutboundAt;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors',
        active && 'bg-primary-50 hover:bg-primary-50'
      )}
    >
      <Avatar name={label} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{label}</p>
          {lastActivity && <span className="text-xs text-slate-400 flex-shrink-0">{formatRelativeTime(lastActivity)}</span>}
        </div>
        {user?.role !== 'EMPLOYEE' && (
          <p className="text-xs text-slate-400">via {conversation.account.user.name} ({conversation.account.displayPhoneNumber})</p>
        )}
        <p className="text-xs text-slate-500 truncate mt-0.5">{conversation.lastMessagePreview || 'No messages yet'}</p>
      </div>
      {conversation.unreadCount > 0 && (
        <span className="flex-shrink-0 bg-green-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
        </span>
      )}
    </button>
  );
}

function MessageStatusIcon({ status }: { status: WhatsAppMessage['status'] }) {
  if (status === 'FAILED') return <AlertTriangle className="w-3 h-3 text-red-300" />;
  if (status === 'READ') return <CheckCheck className="w-3 h-3 text-blue-300" />;
  if (status === 'DELIVERED') return <CheckCheck className="w-3 h-3 text-white/70" />;
  if (status === 'SENT') return <Check className="w-3 h-3 text-white/70" />;
  return <Clock className="w-3 h-3 text-white/50" />;
}

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const outbound = message.direction === 'OUTBOUND';
  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
          outbound ? 'bg-green-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm',
          message.status === 'FAILED' && 'bg-red-50 border border-red-200 text-red-700'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body || `[${message.type}]`}</p>
        <div className={cn('flex items-center gap-1 mt-1', outbound ? 'justify-end' : 'justify-start')}>
          <span className={cn('text-[10px]', outbound ? 'text-white/70' : 'text-slate-400')}>
            {formatRelativeTime(message.timestamp)}
            {message.isEcho && ' · sent from phone'}
          </span>
          {outbound && <MessageStatusIcon status={message.status} />}
        </div>
        {message.status === 'FAILED' && message.errorMessage && (
          <p className="text-xs text-red-600 mt-1">{message.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

export function ThreadPanel({ conversation }: { conversation: WhatsAppConversationSummary }) {
  const { data: messages = [], isLoading } = useWhatsAppMessages(conversation.id);
  const sendMessage = useSendWhatsAppMessage(conversation.id);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const windowClosed = !conversation.lastInboundAt
    || Date.now() - new Date(conversation.lastInboundAt).getTime() > 24 * 60 * 60 * 1000;

  const handleSend = async () => {
    if (!draft.trim()) return;
    try {
      await sendMessage.mutateAsync(draft.trim());
      setDraft('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send message');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 flex items-center gap-3">
        <Avatar name={conversation.lead?.name ?? conversation.customerPhone} size="sm" />
        <div>
          <p className="font-semibold text-slate-800 text-sm">{conversation.lead?.name ?? conversation.customerPhone}</p>
          <p className="text-xs text-slate-400">{conversation.customerPhone} · via {conversation.account.user.name}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-200 rounded-2xl w-2/3" />)}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No messages yet</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        {windowClosed && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            The customer's 24-hour WhatsApp service window has closed — a free-form reply isn't allowed until they message again.
          </p>
        )}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={1}
            placeholder={windowClosed ? 'Waiting for customer to message again...' : 'Type a message...'}
            disabled={windowClosed}
            className="input resize-none text-sm flex-1 disabled:bg-slate-50 disabled:cursor-not-allowed"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <button
            onClick={handleSend}
            disabled={sendMessage.isPending || !draft.trim() || windowClosed}
            className="btn-primary px-4 flex items-center gap-1.5 text-sm flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppInboxView() {
  const { data: conversations = [], isLoading } = useWhatsAppConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="card overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 480 }}>
      <div className="flex h-full">
        <div className="w-full sm:w-80 flex-shrink-0 border-r border-slate-200 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No conversations yet</p>
            </div>
          ) : (
            conversations.map((c) => (
              <ConversationRow key={c.id} conversation={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
            ))
          )}
        </div>
        <div className="hidden sm:block flex-1">
          {selected ? (
            <ThreadPanel conversation={selected} />
          ) : (
            <div className="h-full flex items-center justify-center text-center px-4">
              <div>
                <MessageCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Select a conversation to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
