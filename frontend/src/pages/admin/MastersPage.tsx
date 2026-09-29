import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapPin, Tag, Plus, Edit, Trash2, Search, Star, Globe, Map,
  ToggleLeft, ToggleRight, X, Filter,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  useDestinations, useCreateDestination, useUpdateDestination, useDeleteDestination,
  useTourCategories, useCreateTourCategory, useUpdateTourCategory, useDeleteTourCategory,
  DestinationFilters,
} from '../../hooks/useMasters';
import { Destination, TourCategory } from '../../types/index';
import Modal from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDate, cn } from '../../utils/helpers';

type MasterTab = 'destinations' | 'categories';

const TABS: { key: MasterTab; label: string; icon: React.ElementType }[] = [
  { key: 'destinations', label: 'Destinations', icon: MapPin },
  { key: 'categories',   label: 'Tour Categories', icon: Tag },
];

// ─── Destination Form ─────────────────────────────────────────────────────────

interface DestForm {
  name: string;
  country: string;
  state: string;
  city: string;
  type: 'DOMESTIC' | 'INTERNATIONAL';
  description: string;
  isPopular: boolean;
}

function DestinationFormModal({
  open, onClose, defaultValues, onSubmit, isLoading, isEdit,
}: {
  open: boolean; onClose: () => void; defaultValues?: Partial<Destination>;
  onSubmit: (d: DestForm) => void; isLoading: boolean; isEdit: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<DestForm>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      country: defaultValues?.country ?? '',
      state: defaultValues?.state ?? '',
      city: defaultValues?.city ?? '',
      type: defaultValues?.type ?? 'DOMESTIC',
      description: defaultValues?.description ?? '',
      isPopular: defaultValues?.isPopular ?? false,
    },
  });

  return (
    <Modal
      open={open} onClose={onClose}
      title={isEdit ? 'Edit Destination' : 'New Destination'}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="dest-form" type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </>
      }
    >
      <form id="dest-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Destination Name *</label>
            <input {...register('name', { required: 'Name is required' })} className="input" placeholder="e.g. Kedarnath" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Country *</label>
            <input {...register('country', { required: 'Country is required' })} className="input" placeholder="e.g. India" />
            {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country.message}</p>}
          </div>
          <div>
            <label className="label">Type</label>
            <select {...register('type')} className="input">
              <option value="DOMESTIC">Domestic</option>
              <option value="INTERNATIONAL">International</option>
            </select>
          </div>
          <div>
            <label className="label">State / Region</label>
            <input {...register('state')} className="input" placeholder="e.g. Uttarakhand" />
          </div>
          <div>
            <label className="label">City</label>
            <input {...register('city')} className="input" placeholder="e.g. Rudraprayag" />
          </div>
          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea {...register('description')} rows={3} className="input resize-none" placeholder="Brief description of this destination…" />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <input type="checkbox" id="isPopular" {...register('isPopular')} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
            <label htmlFor="isPopular" className="text-sm font-medium text-slate-700 cursor-pointer">Mark as Popular Destination</label>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── Destinations Tab ─────────────────────────────────────────────────────────

function DestinationsTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editDest, setEditDest] = useState<Destination | null>(null);
  const [deleteDestId, setDeleteDestId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DestinationFilters>({});
  const [searchInput, setSearchInput] = useState('');

  const applySearch = useCallback(() => {
    setFilters(f => ({ ...f, search: searchInput.trim() || undefined }));
  }, [searchInput]);

  const { data, isLoading } = useDestinations(filters);
  const createDest = useCreateDestination();
  const updateDest = useUpdateDestination();
  const deleteDest = useDeleteDestination();

  const destinations = data?.data ?? [];

  const handleCreate = (formData: DestForm) => {
    createDest.mutate(formData, { onSuccess: () => setCreateOpen(false) });
  };

  const handleEdit = (formData: DestForm) => {
    if (!editDest) return;
    updateDest.mutate({ id: editDest.id, ...formData }, { onSuccess: () => setEditDest(null) });
  };

  const handleDelete = () => {
    if (!deleteDestId) return;
    deleteDest.mutate(deleteDestId, { onSuccess: () => setDeleteDestId(null) });
  };

  const handleToggle = (dest: Destination) => {
    updateDest.mutate({ id: dest.id, status: dest.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
  };

  const clearFilters = () => {
    setFilters({});
    setSearchInput('');
  };

  const hasFilters = filters.search || filters.type || filters.isPopular !== undefined;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="Search destinations…"
            className="input pl-9 pr-4"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setFilters(f => ({ ...f, search: undefined })); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <select
            value={filters.type ?? ''}
            onChange={(e) => setFilters(f => ({ ...f, type: (e.target.value as any) || undefined }))}
            className="input py-2 text-sm max-w-[160px]"
          >
            <option value="">All Types</option>
            <option value="DOMESTIC">Domestic</option>
            <option value="INTERNATIONAL">International</option>
          </select>

          <button
            onClick={() => setFilters(f => ({ ...f, isPopular: f.isPopular === true ? undefined : true }))}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
              filters.isPopular
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            )}
          >
            <Star className="w-3.5 h-3.5" />
            Popular
          </button>

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 transition-colors">
              <Filter className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        <div className="sm:ml-auto">
          <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Destination</span>
          </button>
        </div>
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-sm text-slate-500">
          {destinations.length} destination{destinations.length !== 1 ? 's' : ''}
          {hasFilters && ' (filtered)'}
        </p>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Destination</th><th>Country</th><th>State / City</th><th>Type</th><th>Popular</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                      <td key={j}><Skeleton className="h-4 w-24" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : destinations.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <MapPin className="empty-state-icon" />
            <p className="empty-state-title">{hasFilters ? 'No destinations match your filters' : 'No destinations yet'}</p>
            <p className="empty-state-body">
              {hasFilters ? 'Try adjusting your filters.' : 'Add destinations to power your tours and packages.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Destination</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Country</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">State / City</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Popular</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {destinations.map((dest) => (
                  <tr key={dest.id} className={cn('border-b border-slate-100 hover:bg-slate-50 transition-colors', !dest.status || dest.status !== 'ACTIVE' ? 'opacity-50' : '')}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{dest.name}</p>
                        {dest.description && (
                          <p className="text-xs text-slate-400 line-clamp-1 max-w-[200px]">{dest.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {dest.type === 'INTERNATIONAL' ? (
                          <Globe className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                        ) : (
                          <Map className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        )}
                        <span className="text-slate-700">{dest.country}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm">
                      {[dest.state, dest.city].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'badge text-[11px]',
                        dest.type === 'INTERNATIONAL' ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      )}>
                        {dest.type === 'INTERNATIONAL' ? 'International' : 'Domestic'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {dest.isPopular ? (
                        <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                          <Star className="w-3.5 h-3.5 fill-amber-500" /> Popular
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(dest)}
                        className={cn(
                          'flex items-center gap-1 text-xs font-medium transition-colors',
                          dest.status === 'ACTIVE'
                            ? 'text-emerald-600 hover:text-red-500'
                            : 'text-slate-400 hover:text-emerald-600'
                        )}
                      >
                        {dest.status === 'ACTIVE'
                          ? <><ToggleRight className="w-4 h-4" /> Active</>
                          : <><ToggleLeft className="w-4 h-4" /> Inactive</>
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => setEditDest(dest)} className="btn-ghost p-1.5" title="Edit">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteDestId(dest.id)}
                          className="btn-ghost p-1.5 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <DestinationFormModal
        open={createOpen} onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate} isLoading={createDest.isPending} isEdit={false}
      />
      {editDest && (
        <DestinationFormModal
          open={!!editDest} onClose={() => setEditDest(null)} defaultValues={editDest}
          onSubmit={handleEdit} isLoading={updateDest.isPending} isEdit
        />
      )}
      <Modal open={!!deleteDestId} onClose={() => setDeleteDestId(null)} title="Delete Destination" size="sm"
        footer={<>
          <button onClick={() => setDeleteDestId(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleteDest.isPending} className="btn-danger">
            {deleteDest.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </>}
      >
        <p className="text-sm text-slate-600">Delete this destination? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

// ─── Tour Category Form ───────────────────────────────────────────────────────

interface CatForm {
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
}

function CategoryFormModal({
  open, onClose, defaultValues, onSubmit, isLoading, isEdit,
}: {
  open: boolean; onClose: () => void; defaultValues?: Partial<TourCategory>;
  onSubmit: (d: CatForm) => void; isLoading: boolean; isEdit: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<CatForm>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      icon: defaultValues?.icon ?? '',
      sortOrder: defaultValues?.sortOrder ?? 0,
    },
  });

  return (
    <Modal
      open={open} onClose={onClose}
      title={isEdit ? 'Edit Category' : 'New Tour Category'}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="cat-form" type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </>
      }
    >
      <form id="cat-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Category Name *</label>
          <input {...register('name', { required: 'Name is required' })} className="input" placeholder="e.g. Pilgrimage" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Icon (emoji or text)</label>
          <input {...register('icon')} className="input" placeholder="e.g. 🙏 or temple" />
          <p className="text-xs text-slate-400 mt-1">Use an emoji or short label for quick identification.</p>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea {...register('description')} rows={3} className="input resize-none" placeholder="Brief description of this tour category…" />
        </div>
        <div>
          <label className="label">Sort Order</label>
          <input type="number" {...register('sortOrder', { valueAsNumber: true })} className="input" min={0} placeholder="0" />
          <p className="text-xs text-slate-400 mt-1">Lower numbers appear first. Default is 0.</p>
        </div>
      </form>
    </Modal>
  );
}

// ─── Tour Categories Tab ──────────────────────────────────────────────────────

function CategoryCard({ cat, onEdit, onDelete, onToggle }: {
  cat: TourCategory; onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) {
  const isActive = cat.status === 'ACTIVE';

  return (
    <div className={cn('card p-5 flex flex-col gap-3 hover:shadow-md transition-all duration-200', !isActive && 'opacity-60')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-mountain-50 border border-mountain-100 flex items-center justify-center flex-shrink-0 text-lg">
            {cat.icon || <Tag className="w-5 h-5 text-mountain-500" />}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm truncate">{cat.name}</p>
            <span className="text-[10px] text-slate-400 font-mono">Order: {cat.sortOrder}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Edit"><Edit className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="btn-ghost p-1.5 hover:text-red-600" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Description */}
      {cat.description && <p className="text-xs text-slate-500 line-clamp-2">{cat.description}</p>}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
        <span className="text-[10px] text-slate-400">Added {formatDate(cat.createdAt)}</span>
        <button
          onClick={onToggle}
          className={cn('flex items-center gap-1.5 text-xs font-medium transition-colors',
            isActive ? 'text-emerald-600 hover:text-red-500' : 'text-slate-400 hover:text-emerald-600')}
        >
          {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {isActive ? 'Active' : 'Inactive'}
        </button>
      </div>
    </div>
  );
}

function CategoriesTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editCat, setEditCat] = useState<TourCategory | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);

  const { data, isLoading } = useTourCategories();
  const createCat = useCreateTourCategory();
  const updateCat = useUpdateTourCategory();
  const deleteCat = useDeleteTourCategory();

  const categories = data?.data ?? [];

  const handleCreate = (formData: CatForm) => {
    createCat.mutate(formData, { onSuccess: () => setCreateOpen(false) });
  };

  const handleEdit = (formData: CatForm) => {
    if (!editCat) return;
    updateCat.mutate({ id: editCat.id, ...formData }, { onSuccess: () => setEditCat(null) });
  };

  const handleDelete = () => {
    if (!deleteCatId) return;
    deleteCat.mutate(deleteCatId, { onSuccess: () => setDeleteCatId(null) });
  };

  const handleToggle = (cat: TourCategory) => {
    updateCat.mutate({ id: cat.id, status: cat.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}</p>
        <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Category</span>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-3 w-12" /></div>
              </div>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-px w-full" />
              <div className="flex justify-between"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-12" /></div>
            </div>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Tag className="empty-state-icon" />
            <p className="empty-state-title">No tour categories yet</p>
            <p className="empty-state-body">Add categories like Pilgrimage, Adventure, or Leisure to classify your tours.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id} cat={cat}
              onEdit={() => setEditCat(cat)}
              onDelete={() => setDeleteCatId(cat.id)}
              onToggle={() => handleToggle(cat)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <CategoryFormModal
        open={createOpen} onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate} isLoading={createCat.isPending} isEdit={false}
      />
      {editCat && (
        <CategoryFormModal
          open={!!editCat} onClose={() => setEditCat(null)} defaultValues={editCat}
          onSubmit={handleEdit} isLoading={updateCat.isPending} isEdit
        />
      )}
      <Modal open={!!deleteCatId} onClose={() => setDeleteCatId(null)} title="Delete Category" size="sm"
        footer={<>
          <button onClick={() => setDeleteCatId(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleteCat.isPending} className="btn-danger">
            {deleteCat.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </>}
      >
        <p className="text-sm text-slate-600">Delete this tour category? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

// ─── Masters Page ─────────────────────────────────────────────────────────────

export default function MastersPage() {
  const [params, setParams] = useSearchParams();
  const activeTab = (params.get('tab') as MasterTab) || 'destinations';
  const setTab = (tab: MasterTab) => setParams({ tab });

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Masters</h2>
          <p className="page-subtitle">Manage destinations and tour categories used across the platform</p>
        </div>
      </div>

      {/* Tab Strip */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
              activeTab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'destinations' && <DestinationsTab />}
      {activeTab === 'categories'   && <CategoriesTab />}
    </div>
  );
}
