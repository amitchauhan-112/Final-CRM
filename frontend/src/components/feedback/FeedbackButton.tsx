import { useState } from 'react';
import { MessageSquarePlus, X, Bug, Lightbulb, MessageCircle, ChevronDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { useSubmitFeedback } from '../../hooks/useFeedback';
import { cn } from '../../utils/helpers';

type FormValues = {
  type: string;
  title: string;
  description: string;
  priority: string;
};

const typeOptions = [
  { value: 'BUG', label: 'Bug Report', icon: Bug, color: 'text-red-600' },
  { value: 'SUGGESTION', label: 'Suggestion', icon: Lightbulb, color: 'text-amber-600' },
  { value: 'OTHER', label: 'Other', icon: MessageCircle, color: 'text-primary-600' },
];

const priorityOptions = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const submit = useSubmitFeedback();

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { type: 'BUG', priority: 'MEDIUM', title: '', description: '' },
  });

  const selectedType = watch('type');

  const onSubmit = async (values: FormValues) => {
    await submit.mutateAsync({
      ...values,
      page: location.pathname,
    });
    reset();
    setOpen(false);
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-600 to-mountain-600 text-white text-sm font-medium rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
        title="Report a bug or suggestion"
      >
        <MessageSquarePlus className="w-4 h-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-primary-50 to-mountain-50">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Send Feedback</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your input helps us improve the CRM</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
              {/* Type selector */}
              <div>
                <label className="label">Type</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {typeOptions.map(({ value, label, icon: Icon, color }) => (
                    <label
                      key={value}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all text-center',
                        selectedType === value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      )}
                    >
                      <input type="radio" value={value} {...register('type')} className="sr-only" />
                      <Icon className={cn('w-5 h-5', selectedType === value ? 'text-primary-600' : color)} />
                      <span className="text-xs font-medium text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input
                  {...register('title', { required: 'Title is required', minLength: { value: 3, message: 'At least 3 characters' } })}
                  placeholder="Brief summary of the issue or idea"
                  className={cn('input mt-1', errors.title && 'border-red-400')}
                />
                {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="label">Description <span className="text-red-500">*</span></label>
                <textarea
                  {...register('description', { required: 'Description is required', minLength: { value: 10, message: 'At least 10 characters' } })}
                  rows={3}
                  placeholder="Describe the bug, steps to reproduce, or your suggestion..."
                  className={cn('input mt-1 resize-none', errors.description && 'border-red-400')}
                />
                {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
              </div>

              {/* Priority */}
              <div>
                <label className="label">Priority</label>
                <div className="relative mt-1">
                  <select {...register('priority')} className="input appearance-none pr-8">
                    {priorityOptions.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Page context (readonly) */}
              <p className="text-xs text-slate-400">
                Page: <span className="font-mono">{location.pathname}</span>
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { reset(); setOpen(false); }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submit.isPending}
                  className="btn-primary flex-1"
                >
                  {submit.isPending ? 'Submitting…' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
