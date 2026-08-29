import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Target, CheckCircle, Megaphone, FileText, Users, MapPin, Calendar, TrendingUp, StickyNote, Paperclip, Archive, ChevronDown, ChevronUp, Download, Link2, FileSpreadsheet } from 'lucide-react';
import { useCampaigns, useCampaign, useCampaignStats, useCreateCampaign, useUpdateCampaign, useDeleteCampaign } from '../../hooks/useCampaigns';
import { useArchivedCampaigns, useArchiveDownload } from '../../hooks/useMetaConnection';
import { Campaign, CampaignStatus, Lead } from '../../types/index';
import CampaignCard from '../../components/campaigns/CampaignCard';
import CampaignForm from '../../components/campaigns/CampaignForm';
import CampaignNotesSection from '../../components/campaigns/CampaignNotesSection';
import CampaignAttachmentsSection from '../../components/campaigns/CampaignAttachmentsSection';
import Modal from '../../components/ui/Modal';
import StatsCard from '../../components/ui/StatsCard';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import toast from 'react-hot-toast';
import { cn, formatDate, formatCurrency, formatDateTime } from '../../utils/helpers';
import { exportLeadsToExcel } from '../../utils/export';

const STATUS_TABS: { value: CampaignStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'DRAFT', label: 'Draft' },
];

// ─── Campaign Detail Modal ────────────────────────────────────────────────────

function CampaignDetailModal({
  campaignId,
  onClose,
  onEdit,
}: {
  campaignId: string | null;
  onClose: () => void;
  onEdit: (c: Campaign) => void;
}) {
  const { data, isLoading } = useCampaign(campaignId);
  const campaign = data?.data as any;
  const [campaignTab, setCampaignTab] = useState<'overview' | 'notes' | 'attachments'>('overview');

  if (!campaignId) return null;

  return (
    <Modal open={!!campaignId} onClose={onClose} title="Campaign Detail" size="2xl">
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : campaign ? (
        <div className="space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            {([
              ['overview', 'Overview', TrendingUp],
              ['notes', 'Notes', StickyNote],
              ['attachments', 'Attachments', Paperclip],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setCampaignTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  campaignTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Notes */}
          {campaignTab === 'notes' && <CampaignNotesSection campaignId={campaignId} />}

          {/* Tab: Attachments */}
          {campaignTab === 'attachments' && <CampaignAttachmentsSection campaignId={campaignId} />}

          {/* Tab: Overview */}
          {campaignTab === 'overview' && <>
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge campaignStatus={campaign.status} />
                {campaign.isFromMeta && (
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100 tracking-wide">
                    <Link2 className="w-2.5 h-2.5" />
                    META
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900">{campaign.name}</h2>
              <div className="flex items-center gap-1.5 text-slate-500 text-sm mt-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{campaign.destination}</span>
              </div>
              {campaign.description && (
                <p className="text-sm text-slate-500 mt-2">{campaign.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => exportLeadsToExcel(`?campaignId=${campaign.id}`)}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Leads
              </button>
              <button
                onClick={() => { onClose(); onEdit(campaign); }}
                className="btn-secondary text-sm"
              >
                Edit Campaign
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
              <p className="text-2xl font-bold text-slate-800">{campaign._count?.leads ?? 0}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total Leads</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
              <p className="text-2xl font-bold text-green-700">
                {(campaign.leads as Lead[] ?? []).filter((l: Lead) => l.status === 'CONFIRMED').length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Confirmed</p>
            </div>
            {campaign.targetLeads && (
              <div className="bg-primary-50 rounded-xl p-3 text-center border border-primary-100">
                <p className="text-2xl font-bold text-primary-700">{campaign.targetLeads}</p>
                <p className="text-xs text-slate-500 mt-0.5">Target</p>
              </div>
            )}
            {campaign.budget && (
              <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
                <p className="text-lg font-bold text-orange-700">{formatCurrency(campaign.budget)}</p>
                <p className="text-xs text-slate-500 mt-0.5">Budget</p>
              </div>
            )}
          </div>

          {/* Dates */}
          {(campaign.startDate || campaign.endDate) && (
            <div className="flex items-center gap-4 text-sm text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200">
              <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {campaign.startDate && <span>Start: <strong>{formatDate(campaign.startDate)}</strong></span>}
              {campaign.endDate && <span>End: <strong>{formatDate(campaign.endDate)}</strong></span>}
            </div>
          )}

          {/* Assigned employees */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Assigned Employees ({campaign.employees?.length ?? 0})
            </h3>
            {campaign.employees?.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No employees assigned</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {campaign.employees?.map((ce: any) => (
                  <div key={ce.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <Avatar name={ce.user.name} size="xs" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{ce.user.name}</p>
                      <p className="text-xs text-slate-400">{ce.user.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leads table */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Leads ({campaign._count?.leads ?? 0}){campaign.leads?.length < (campaign._count?.leads ?? 0) && ` — showing last ${campaign.leads.length}`}
            </h3>
            {campaign.leads?.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No leads tagged to this campaign yet</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Name</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Phone</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Status</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Assigned To</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.leads?.map((lead: any) => (
                      <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-800">{lead.name}</p>
                          {lead.email && <p className="text-xs text-slate-400">{lead.email}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{lead.phone}</td>
                        <td className="px-3 py-2.5">
                          <Badge status={lead.status} />
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {lead.assignedTo?.name ?? <span className="text-slate-400 italic">Unassigned</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs">
                          {lead.followUpDate ? formatDateTime(lead.followUpDate) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>}
        </div>
      ) : (
        <p className="text-slate-400 text-center py-8">Campaign not found</p>
      )}
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCampaignsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<CampaignStatus | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | null>(null);
  const [detailCampaignId, setDetailCampaignId] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const filters = activeTab === 'ALL' ? {} : { status: activeTab };
  const { data, isLoading } = useCampaigns({ ...filters, limit: 50 });
  const { data: statsData } = useCampaignStats();
  const { data: archivedCampaigns = [] } = useArchivedCampaigns();
  const archiveDownload = useArchiveDownload();
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaignMutation = useDeleteCampaign();

  const campaigns = data?.data ?? [];
  const stats = statsData?.data ?? [];

  const totalLeads = stats.reduce((a, c) => a + c.total, 0);
  const totalConfirmed = stats.reduce((a, c) => a + c.confirmed, 0);
  const activeCampaigns = stats.filter((c) => c.status === 'ACTIVE').length;
  const avgConversion =
    stats.length > 0
      ? (stats.reduce((a, c) => a + parseFloat(c.conversionRate), 0) / stats.length).toFixed(1)
      : '0';

  const handleCreate = (formData: any) => {
    createCampaign.mutate(formData, { onSuccess: () => setCreateOpen(false) });
  };

  const handleEdit = (formData: any) => {
    if (!editCampaign) return;
    updateCampaign.mutate({ id: editCampaign.id, ...formData }, { onSuccess: () => setEditCampaign(null) });
  };

  const handleDelete = () => {
    if (!deleteCampaign) return;
    deleteCampaignMutation.mutate(deleteCampaign.id, { onSuccess: () => setDeleteCampaign(null) });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Campaigns</h2>
          <p className="page-subtitle">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Campaign</span>
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard label="Active Campaigns" value={activeCampaigns} icon={Megaphone} iconBg="bg-mountain-100" iconColor="text-mountain-600" onClick={() => setActiveTab('ACTIVE')} />
        <StatsCard label="Total Leads" value={totalLeads} icon={Target} iconBg="bg-primary-100" iconColor="text-primary-600" onClick={() => navigate('/admin/leads')} />
        <StatsCard label="Confirmed" value={totalConfirmed} icon={CheckCircle} iconBg="bg-green-100" iconColor="text-green-600" onClick={() => navigate('/admin/leads?status=CONFIRMED')} />
        <StatsCard label="Avg. Conversion" value={`${avgConversion}%`} icon={FileText} iconBg="bg-orange-100" iconColor="text-orange-600" />
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Campaign grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card overflow-hidden">
              <div className="skeleton h-28" />
              <div className="p-5 space-y-3">
                <div className="skeleton h-4 w-3/4 rounded-lg" />
                <div className="skeleton h-3 w-1/2 rounded-lg" />
                <div className="grid grid-cols-3 gap-2">
                  {[1,2,3].map(j => <div key={j} className="skeleton h-12 rounded-xl" />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card p-12 text-center">
          <Megaphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No campaigns found</p>
          <p className="text-slate-400 text-sm mt-1">Create your first campaign to get started</p>
          <button onClick={() => setCreateOpen(true)} className="btn-primary mt-4">
            <Plus className="w-4 h-4 inline mr-2" />
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onView={(c) => setDetailCampaignId(c.id)}
              onEdit={setEditCampaign}
              onDelete={setDeleteCampaign}
            />
          ))}
        </div>
      )}

      {/* Archived campaigns */}
      {archivedCampaigns.length > 0 && (
        <div>
          <button
            onClick={() => setArchivedOpen(!archivedOpen)}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors py-1.5"
          >
            <Archive className="w-4 h-4" />
            Archived ({archivedCampaigns.length})
            {archivedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {archivedOpen && (
            <div className="card overflow-hidden mt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Campaign</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Destination</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Leads</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Archived On</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Archive File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedCampaigns.map((ac) => (
                      <tr key={ac.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{ac.name}</td>
                        <td className="px-4 py-3 text-slate-500">{ac.destination}</td>
                        <td className="px-4 py-3 text-slate-600">{ac._count.leads}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(ac.archivedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {ac.archiveS3Key ? (
                            <button
                              onClick={async () => {
                                try {
                                  const result = await archiveDownload.mutateAsync(ac.id);
                                  window.open(result.url, '_blank', 'noopener,noreferrer');
                                } catch {
                                  toast.error('Failed to get download link');
                                }
                              }}
                              disabled={archiveDownload.isPending}
                              className="btn-secondary text-xs py-1 px-3 inline-flex items-center gap-1 ml-auto"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">No file</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Campaign detail */}
      <CampaignDetailModal
        campaignId={detailCampaignId}
        onClose={() => setDetailCampaignId(null)}
        onEdit={(c) => { setDetailCampaignId(null); setEditCampaign(c); }}
      />

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Campaign" size="2xl">
        <CampaignForm
          onSubmit={handleCreate}
          isLoading={createCampaign.isPending}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editCampaign} onClose={() => setEditCampaign(null)} title="Edit Campaign" size="2xl">
        {editCampaign && (
          <CampaignForm
            key={editCampaign.id}
            defaultValues={editCampaign}
            onSubmit={handleEdit}
            isLoading={updateCampaign.isPending}
            onCancel={() => setEditCampaign(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteCampaign} onClose={() => setDeleteCampaign(null)} title="Delete Campaign" size="sm">
        <p className="text-slate-600">
          Are you sure you want to delete <strong>{deleteCampaign?.name}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setDeleteCampaign(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleteCampaignMutation.isPending} className="btn-danger">
            {deleteCampaignMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
