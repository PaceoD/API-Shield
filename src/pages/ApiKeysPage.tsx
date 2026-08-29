import React, { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Plus,
  Shield,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FormField } from '../components/ui/FormField';
import { Input, Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { CopyButton } from '../components/ui/CodeBlock';
import { useToast } from '../context/ToastContext';
import { keysService, CreateKeyInput } from '../services/keysService';
import { apisService } from '../services/apisService';
import { ApiKey, ApiConfig } from '../types/api';

export const ApiKeysPage: React.FC = () => {
  const toast = useToast();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiFilter, setApiFilter] = useState('all');

  // Create Key Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedApiId, setSelectedApiId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  // Revoke Key Confirmation State
  const [revokingKey, setRevokingKey] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [keysData, apisData] = await Promise.all([
        keysService.getAll(),
        apisService.getAll(),
      ]);
      setKeys(keysData);
      setApis(apisData);
    } catch (err: any) {
      toast.error('Failed to load API keys', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateModal = () => {
    setKeyName('');
    setSelectedApiId(apis.length > 0 ? apis[0].id : '');
    setCreatedSecret(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim() || !selectedApiId) {
      toast.error('Missing target API', 'Please select an API to associate this key with.');
      return;
    }

    setCreating(true);
    try {
      const payload: CreateKeyInput = {
        name: keyName.trim(),
        apiId: selectedApiId,
      };

      const result = await keysService.create(payload);
      setCreatedSecret(result.secretKey || null);
      toast.success('API Key generated', 'Save your secret key securely.');
      fetchData();
    } catch (err: any) {
      toast.error('Failed to create key', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokingKey) return;
    setRevoking(true);
    try {
      await keysService.revoke(revokingKey.id);
      toast.success('Key revoked', `${revokingKey.name} has been revoked.`);
      setRevokingKey(null);
      fetchData();
    } catch (err: any) {
      toast.error('Failed to revoke key', err.message);
    } finally {
      setRevoking(false);
    }
  };

  const filteredKeys = keys.filter((k) => {
    const matchesSearch =
      k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.apiName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.maskedKey.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesApi = apiFilter === 'all' || k.apiId === apiFilter;
    return matchesSearch && matchesApi;
  });

  const columns: Column<ApiKey>[] = [
    {
      key: 'name',
      header: 'Key Name',
      width: '24%',
      render: (k) => (
        <div className="flex flex-col">
          <span className="font-semibold text-xs text-zinc-100">{k.name}</span>
          <span className="text-[11px] text-zinc-500 font-mono mt-0.5">{k.id}</span>
        </div>
      ),
    },
    {
      key: 'api',
      header: 'Associated API',
      width: '22%',
      render: (k) => (
        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
          <Shield className="w-3.5 h-3.5 text-zinc-500" />
          <span className="truncate">{k.apiName}</span>
        </div>
      ),
    },
    {
      key: 'token',
      header: 'Token Mask',
      width: '24%',
      render: (k) => (
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
            {k.maskedKey}
          </code>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '12%',
      render: (k) => (
        <Badge variant={k.status === 'active' ? 'success' : 'default'} size="sm">
          {k.status === 'active' ? 'Active' : 'Revoked'}
        </Badge>
      ),
    },
    {
      key: 'lastUsed',
      header: 'Last Used',
      width: '18%',
      render: (k) => (
        <span className="text-xs text-zinc-400 font-mono">
          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '8%',
      align: 'right',
      render: (k) =>
        k.status === 'active' ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setRevokingKey(k)}
            className="text-zinc-500 hover:text-rose-400"
            title="Revoke Key"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <span className="text-[10px] text-zinc-600 font-mono">Revoked</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Key Management"
        description="Provision and revoke cryptographically secure API keys scoped to individual APIs."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={openCreateModal}
            disabled={apis.length === 0}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Generate Key
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
            placeholder="Search keys by name, API, prefix..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            value={apiFilter}
            onChange={(e) => setApiFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All APIs' },
              ...apis.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            title="Refresh keys"
          />
        </div>
      </div>

      {/* Keys Table */}
      <DataTable
        columns={columns}
        data={filteredKeys}
        keyExtractor={(k) => k.id}
        loading={loading}
        emptyTitle="No API Keys Found"
        emptyDescription={
          apis.length === 0
            ? 'Create an API before generating API keys.'
            : 'Generate an API key to allow client applications to authenticate through APIShield.'
        }
        emptyAction={
          apis.length > 0 ? (
            <Button variant="primary" size="sm" onClick={openCreateModal}>
              Generate API Key
            </Button>
          ) : undefined
        }
      />

      {/* Create Key Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreatedSecret(null);
        }}
        title={createdSecret ? 'API Key Generated' : 'Generate New API Key'}
        description={
          createdSecret
            ? 'Copy your secret token now. This key will only be shown once.'
            : 'Create an authenticated API key scoped to a specific API.'
        }
        footer={
          createdSecret ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setIsCreateOpen(false);
                setCreatedSecret(null);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateSubmit}
                loading={creating}
                disabled={!selectedApiId}
              >
                Generate Key
              </Button>
            </>
          )
        }
      >
        {createdSecret ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-zinc-950 border border-emerald-800/60 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Secret Key (One-time reveal)
              </div>
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-sm text-zinc-100 break-all select-all font-semibold">
                  {createdSecret}
                </code>
                <CopyButton text={createdSecret} label="Copy" />
              </div>
            </div>

            <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg text-xs text-amber-300 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Security Notice:</strong> Store this key safely in your environment variables.
                APIShield stores only a one-way hash/mask and cannot retrieve the secret key later.
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <FormField
              label="Key Name"
              required
              description="A recognizable name for this key (e.g. 'Staging Backend Worker', 'Mobile App Client')."
            >
              <Input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g. Backend Production Key"
                required
              />
            </FormField>

            <FormField
              label="Target API"
              required
              description="The specific API service this credential is authorized to access."
            >
              <Select
                value={selectedApiId}
                onChange={(e) => setSelectedApiId(e.target.value)}
                options={apis.map((a) => ({ value: a.id, label: a.name }))}
              />
            </FormField>
          </form>
        )}
      </Modal>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!revokingKey}
        onClose={() => setRevokingKey(null)}
        onConfirm={handleRevokeConfirm}
        loading={revoking}
        title="Revoke API Key?"
        message={
          <>
            Are you sure you want to revoke <strong className="text-zinc-100">{revokingKey?.name}</strong> (
            <code className="text-rose-300 font-mono text-xs">{revokingKey?.maskedKey}</code>)?
            <br />
            <br />
            Any application using this key will immediately receive{' '}
            <strong className="text-rose-400">401 Unauthorized</strong> on subsequent gateway requests.
          </>
        }
        confirmLabel="Revoke Key"
        variant="destructive"
      />
    </div>
  );
};
