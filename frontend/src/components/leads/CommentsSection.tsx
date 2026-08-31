import { useState, useEffect } from 'react';
import { MessageSquare, Send, Edit2, Trash2, Reply, ChevronDown, ChevronUp } from 'lucide-react';
import { useLeadComments, useCreateComment, useUpdateComment, useDeleteComment } from '../../hooks/useComments';
import { useAuthStore } from '../../store/authStore';
import { LeadComment } from '../../types/index';
import Avatar from '../ui/Avatar';
import { formatRelativeTime, cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

interface CommentItemProps {
  comment: LeadComment;
  leadId: string;
  depth?: number;
}

function CommentItem({ comment, leadId, depth = 0 }: CommentItemProps) {
  const { user } = useAuthStore();
  const updateComment = useUpdateComment(leadId);
  const deleteComment = useDeleteComment(leadId);
  const createComment = useCreateComment(leadId);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplies, setShowReplies] = useState(true);

  const canEdit = user?.id === comment.authorId;
  const canDelete = user?.id === comment.authorId || user?.role === 'ADMIN';

  const handleSave = async () => {
    if (!editText.trim()) return;
    try {
      await updateComment.mutateAsync({ id: comment.id, content: editText.trim() });
      setEditing(false);
      toast.success('Comment updated');
    } catch { toast.error('Failed to update comment'); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this comment?')) return;
    try {
      await deleteComment.mutateAsync(comment.id);
      toast.success('Comment deleted');
    } catch { toast.error('Failed to delete comment'); }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    try {
      await createComment.mutateAsync({ content: replyText.trim(), parentId: comment.id });
      setReplyText('');
      setReplying(false);
      setShowReplies(true);
    } catch { toast.error('Failed to post reply'); }
  };

  return (
    <div className={cn('group', depth > 0 && 'ml-8 pl-3 border-l-2 border-slate-100')}>
      <div className="flex gap-2.5">
        <Avatar name={comment.author.name} size="xs" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{comment.author.name}</span>
            <span className="text-xs text-slate-400">{formatRelativeTime(comment.createdAt)}</span>
            {comment.isEdited && <span className="text-xs text-slate-400 italic">(edited)</span>}
          </div>

          {editing ? (
            <div className="mt-1.5 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                className="input text-sm resize-none w-full"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={updateComment.isPending} className="btn-primary py-1.5 text-xs">Save</button>
                <button onClick={() => { setEditing(false); setEditText(comment.content); }} className="btn-secondary py-1.5 text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">{comment.content}</p>
          )}

          {!editing && (
            <div className="flex items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {depth === 0 && (
                <button
                  onClick={() => setReplying(!replying)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary-600 transition-colors"
                >
                  <Reply className="w-3.5 h-3.5" />
                  Reply
                </button>
              )}
              {canEdit && (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
              {canDelete && (
                <button onClick={handleDelete} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
          )}

          {replying && (
            <div className="mt-2 flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                placeholder={`Reply to ${comment.author.name}...`}
                className="input text-sm resize-none flex-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply(); }}
              />
              <div className="flex flex-col gap-1">
                <button onClick={handleReply} disabled={createComment.isPending} className="btn-primary p-1.5">
                  <Send className="w-4 h-4" />
                </button>
                <button onClick={() => setReplying(false)} className="btn-secondary p-1.5 text-xs">✕</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 mb-2 ml-9"
          >
            {showReplies ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
          </button>
          {showReplies && (
            <div className="space-y-3 mt-1">
              {comment.replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} leadId={leadId} depth={1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  leadId: string;
}

export default function CommentsSection({ leadId }: Props) {
  const { user } = useAuthStore();
  const { data: comments = [], isLoading } = useLeadComments(leadId);
  const createComment = useCreateComment(leadId);
  const draftKey = `comment_draft_${leadId}`;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? '');

  // Carried over from the old Notes autosave — recovers an in-progress
  // comment if the tab/lead is closed or the browser crashes mid-draft.
  useEffect(() => {
    setText(localStorage.getItem(draftKey) ?? '');
  }, [leadId]);

  const handleChange = (val: string) => {
    setText(val);
    if (val) localStorage.setItem(draftKey, val);
    else localStorage.removeItem(draftKey);
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    try {
      await createComment.mutateAsync({ content: text.trim() });
      setText('');
      localStorage.removeItem(draftKey);
    } catch { toast.error('Failed to post comment'); }
  };

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="flex gap-2.5">
        <Avatar name={user?.name ?? 'You'} size="xs" />
        <div className="flex-1 space-y-2">
          <textarea
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            rows={2}
            placeholder="Add an internal note... (visible only to staff)"
            className="input text-sm resize-none w-full"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">⌘/Ctrl+Enter to post</span>
            <button
              onClick={handleSubmit}
              disabled={createComment.isPending || !text.trim()}
              className="flex items-center gap-1.5 btn-primary py-1.5 text-xs"
            >
              <Send className="w-3.5 h-3.5" />
              Post
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-2.5 animate-pulse">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-slate-200 rounded w-1/3" />
                <div className="h-8 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-6">
          <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} leadId={leadId} />
          ))}
        </div>
      )}
    </div>
  );
}
