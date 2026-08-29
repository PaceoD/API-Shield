import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Trash2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FormField } from '../components/ui/FormField';
import { Input, Textarea, Select, Switch } from '../components/ui/Input';
import { CopyButton } from '../components/ui/CodeBlock';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../context/ToastContext';
import { apisService, CreateApiInput } from '../services/apisService';
import { ApiConfig } from '../types/api';

const WINDOW_OPTIONS = [
  { value: '10', label: '10 seconds' },
  { value: '60', label: '1 minute (60s)' },
  { value: '300', label: '5 minutes (300s)' },
  { value: '3600', label: '1 hour (3600s)' },
  { value: '86400', label: '24 hours' },
];

export const ApisPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApi, setEditingApi] = useState<ApiConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirm State
  const [deletingApi, setDeletingApi] = useState<ApiConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTargetUrl, setFormTargetUrl] = useState('');
  const [formPathPrefix, setFormPathPrefix] = useState('');
  const [formRateLimit, setFormRateLimit] = useState('60');
  const [formRateWindowSeconds, setFormRateWindowSeconds] = useState('60');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchApis = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apisService.getAll();
      setApis(data);
    } catch (err: any) {
      toast.error('Failed to load APIs', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchApis();
  }, [fetchApis]);

  const openCreateModal = () => {
    setEditingApi(null);
    setFormName('');
    setFormDescription('');
    setFormTargetUrl('');
    setFormPathPrefix('');
    setFormRateLimit('60');
    setFormRateWindowSeconds('60');
    setFormEnabled(true);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (api: ApiConfig, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingApi(api);
    setFormName(api.name);
    setFormDescription(api.description || '');
    setFormPathPrefix(api.pathPrefix || '');
    setFormTargetUrl(api.targetUrl);
    setFormRateLimit(api.rateLimit.toString());
    setFormRateWindowSeconds((api.rateWindowSeconds || 60).toString());
    setFormEnabled(api.enabled);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formName.trim()) {
      errors.name = 'API name is required.';
    }
    if (!formTargetUrl.trim()) {
      errors.targetUrl = 'Target URL is required.';
    } else if (!formTargetUrl.startsWith('http://') && !formTargetUrl.startsWith('https://')) {
      errors.targetUrl = 'Target URL must start with http:// or https://';
    }
    const limitNum = Number(formRateLimit);
    if (!limitNum || limitNum <= 0) {
      errors.rateLimit = 'Rate limit must be a positive integer.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const payload: CreateApiInput = {
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      targetUrl: formTargetUrl.trim(),
      pathPrefix: formPathPrefix.trim() || undefined,
      rateLimit: parseInt(formRateLimit, 10),
      rateWindowSeconds: parseInt(formRateWindowSeconds, 10) || 60,
      enabled: formEnabled,
    };

    setSubmitting(true);
    try {
      if (editingApi) {
        await apisService.update(editingApi.id, payload);
        toast.success('API updated successfully', `${payload.name} configuration saved.`);
      } else {
        const created = await apisService.create(payload);
        toast.success('API created successfully', `Gateway endpoint ready at /api/gateway/${created.id}`);
      }
      setIsModalOpen(false);
      fetchApis();
    } catch (err: any) {
      toast.error(editingApi ? 'Failed to update API' : 'Failed to create API', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingApi) return;
    setDeleting(true);
    try {
      await apisService.delete(deletingApi.id);
      toast.success('API deleted', `${deletingApi.name} has been removed.`);
      setDeletingApi(null);
      fetchApis();
    } catch (err: any) {
      toast.error('Failed to delete API', err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredApis = apis.filter((api) => {
    const query = searchQuery.toLowerCase();
    return (
      api.name.toLowerCase().includes(query) ||
      api.targetUrl.toLowerCase().includes(query) ||
      (api.description && api.description.toLowerCase().includes(query))
    );
  });

  const columns: Column<ApiConfig>[] = [
    {
      key: 'name',
      header: 'API Name',
      width: '26%',
      render: (api) => (
        <div className="flex flex-col">
          <span className="font-semibold text-xs text-zinc-100">{api.name}</span>
          <span className="text-[11px] text-zinc-500 font-mono mt-0.5">
            /api/gateway/{api.id}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '10%',
      render: (api) => (
        <Badge variant={api.enabled ? 'success' : 'default'} size="sm">
          <span className={`w-1.5 h-1.5 rounded-full ${api.enabled ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
          {api.enabled ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'targetUrl',
      header: 'Target URL',
      width: '26%',
      render: (api) => (
        <div className="flex items-center gap-1.5 max-w-xs group">
          <span className="font-mono text-xs text-zinc-300 truncate" title={api.targetUrl}>
            {api.targetUrl}
          </span>
          <CopyButton text={api.targetUrl} size="xs" className="opacity-0 group-hover:opacity-100" />
        </div>
      ),
    },
    {
      key: 'rateLimit',
      header: 'Rate Limit',
      width: '14%',
      render: (api) => (
        <div className="flex items-center gap-1 font-mono text-xs text-zinc-300">
          <Clock className="w-3 h-3 text-zinc-500" />
          <span>
            {api.rateLimit} req / {api.rateWindowSeconds === 60 ? 'min' : `${api.rateWindowSeconds}s`}
          </span>
        </div>
      ),
    },
    {
      key: 'requests',
      header: 'Traffic',
      width: '12%',
      align: 'right',
      render: (api) => (
        <div className="font-mono text-xs text-right">
          <div className="text-zinc-200 font-medium">
            {api.metrics?.totalRequests.toLocaleString() ?? 0}
          </div>
          <div className="text-[10px] text-zinc-500">{api.metrics?.avgLatency ?? 0} ms</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '12%',
      align: 'right',
      render: (api) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => openEditModal(api, e)}
            title="Edit configuration"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-zinc-500 hover:text-rose-400"
            onClick={() => setDeletingApi(api)}
            title="Delete API"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configured APIs"
        description="Manage upstream target routes, configure rate-limit thresholds, and monitor proxy gateways."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={openCreateModal}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Register API
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/80">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter APIs by name, target URL..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchApis}
          loading={loading}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          title="Refresh APIs"
        />
      </div>

      {/* APIs Table */}
      <DataTable
        columns={columns}
        data={filteredApis}
        keyExtractor={(api) => api.id}
        loading={loading}
        onRowClick={(api) => navigate(`/apis/${api.id}`)}
        emptyTitle="No APIs Configured"
        emptyDescription="Register an upstream target API to begin proxying traffic, applying rate limits, and collecting metrics."
        emptyAction={
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            Register First API
          </Button>
        }
      />

      {/* Create / Edit API Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !submitting && setIsModalOpen(false)}
        title={editingApi ? `Edit ${editingApi.name}` : 'Register New Upstream API'}
        description={
          editingApi
            ? 'Update upstream target URL, rate limit quotas, and status.'
            : 'Configure a target destination service to receive rate-limited gateway proxying.'
        }
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              loading={submitting}
            >
              {editingApi ? 'Save Changes' : 'Create API'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="API Name"
            required
            description="A descriptive name for your service (e.g. 'Payment Service', 'Local Echo API')."
            error={formErrors.name}
          >
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. User Microservice"
              hasError={!!formErrors.name}
            />
          </FormField>

          <FormField
            label="Target URL"
            required
            description="The real upstream destination server that APIShield forwards requests to."
            error={formErrors.targetUrl}
          >
            <Input
              value={formTargetUrl}
              onChange={(e) => setFormTargetUrl(e.target.value)}
              placeholder="http://localhost:3001/api/echo or https://api.yourdomain.com"
              hasError={!!formErrors.targetUrl}
            />
          </FormField>

          <FormField
            label="Description (Optional)"
            description="Internal notes or documentation for this API."
          >
            <Textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Describe endpoints, expected loads, or upstream service owners..."
              rows={2}
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Rate Limit (Max Requests)"
              required
              description="Maximum requests permitted within the configured window."
              error={formErrors.rateLimit}
            >
              <Input
                type="number"
                value={formRateLimit}
                onChange={(e) => setFormRateLimit(e.target.value)}
                min="1"
                hasError={!!formErrors.rateLimit}
              />
            </FormField>

            <FormField
              label="Time Window"
              required
              description="Sliding window duration for calculating rate limits."
            >
              <Select
                value={formRateWindowSeconds}
                onChange={(e) => setFormRateWindowSeconds(e.target.value)}
                options={WINDOW_OPTIONS}
              />
            </FormField>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800 space-y-3 mt-2">
            <Switch
              checked={formEnabled}
              onChange={setFormEnabled}
              label="API Enabled"
              description="Disable this API to immediately reject incoming requests with HTTP 403."
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deletingApi}
        onClose={() => !deleting && setDeletingApi(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={`Delete API "${deletingApi?.name}"?`}
        message={
          <>
            Are you sure you want to delete <strong className="text-zinc-100">{deletingApi?.name}</strong>?
            Incoming traffic to <code className="text-rose-300 font-mono text-xs">/api/gateway/{deletingApi?.id}</code> will immediately return 404 Not Found.
          </>
        }
        confirmLabel="Delete API"
        variant="destructive"
      />
    </div>
  );
};
