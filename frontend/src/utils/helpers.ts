import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LeadStatus, LeadSource, CampaignStatus } from '../types/index.ts';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const leadStatusConfig: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  NEW:                  { label: 'New',               color: 'text-blue-700',   bg: 'bg-blue-100' },
  NOT_CONTACTED:        { label: 'Not Contacted',      color: 'text-slate-700',  bg: 'bg-slate-200' },
  CONTACTED:            { label: 'Contacted',          color: 'text-yellow-700', bg: 'bg-yellow-100' },
  INTERESTED:           { label: 'Interested',         color: 'text-purple-700', bg: 'bg-purple-100' },
  FOLLOW_UP_SCHEDULED:  { label: 'Follow-up Sched.',   color: 'text-orange-700', bg: 'bg-orange-100' },
  CONFIRMED:            { label: 'Confirmed',          color: 'text-green-700',  bg: 'bg-green-100' },
  LOST:                 { label: 'Lost',               color: 'text-red-700',    bg: 'bg-red-100' },
};

export const leadSourceConfig: Record<LeadSource, { label: string; color: string; bg: string; icon: string }> = {
  WHATSAPP:  { label: 'WhatsApp',  color: 'text-green-700',  bg: 'bg-green-100',  icon: '💬' },
  INSTAGRAM: { label: 'Instagram', color: 'text-pink-700',   bg: 'bg-pink-100',   icon: '📸' },
  MANUAL:    { label: 'Manual',    color: 'text-slate-700',  bg: 'bg-slate-100',  icon: '✏️' },
  WEBSITE:   { label: 'Website',   color: 'text-blue-700',   bg: 'bg-blue-100',   icon: '🌐' },
  META_ADS:  { label: 'Meta Ads',  color: 'text-indigo-700', bg: 'bg-indigo-100', icon: '📢' },
};

export const campaignStatusConfig: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: 'Active',    color: 'text-green-700',  bg: 'bg-green-100' },
  PAUSED:    { label: 'Paused',    color: 'text-yellow-700', bg: 'bg-yellow-100' },
  COMPLETED: { label: 'Completed', color: 'text-slate-700',  bg: 'bg-slate-100' },
  DRAFT:     { label: 'Draft',     color: 'text-blue-700',   bg: 'bg-blue-100' },
  ENDED:     { label: 'Ended',     color: 'text-purple-700', bg: 'bg-purple-100' },
};

export const formatDate = (date: string | Date | undefined | null): string => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
};

export const formatDateTime = (date: string | Date | undefined | null): string => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
};

export const formatRelativeTime = (date: string | Date): string => {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
};

export const isOverdue = (date: string | Date | null | undefined): boolean => {
  if (!date) return false;
  return new Date(date) < new Date();
};

export const formatCurrency = (amount: number | null | undefined): string => {
  if (!amount) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
};

export const getInitials = (name: string): string => {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
};

// Plain "click to chat" link (wa.me) — opens whatever WhatsApp is already
// logged into the device that clicks it (the employee's own app/account).
// No API, no Meta connection, no cost — just a deep link, same as any
// "Chat on WhatsApp" button. Assumes Indian numbers by default since that's
// this CRM's customer base; strips everything but digits and adds the
// country code only if one isn't already present.
export const buildWhatsAppLink = (phone: string | null | undefined, message?: string): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const base = `https://wa.me/${withCountryCode}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
};
