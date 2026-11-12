'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  RefreshCw,
  Play,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { DocumentUploadField } from '@/components/accounts/DocumentUploadField';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatDateDMY } from '@/lib/formatters';
import { formatPaisaBDT, paisaToTaka, takaToPaisa } from '@/lib/accounts-money';
import {
  downloadExcel,
  matchesSearch,
  printTableReport,
  sortTableItems,
  type SortDir,
} from '@/lib/client-export';

interface AssetRow {
  _id: string;
  assetCode: string;
  name: string;
  categoryTag: string;
  quantity: number;
  purchaseDate: string;
  costPaisa: number;
  supplier: string;
  location: string;
  serialNumber?: string;
  condition: 'Good' | 'NeedsRepair' | 'Damaged';
  usefulLifeMonths: number;
  salvageValuePaisa: number;
  accumulatedDepreciationPaisa: number;
  status: 'Active' | 'Disposed' | 'WrittenOff';
  paymentType: 'Paid' | 'Credit' | 'Opening';
  isPreExisting?: boolean;
  attachmentUrl?: string;
  branch: string;
}

interface DepreciationRunRow {
  _id: string;
  periodId: string;
  periodName: string;
  fiscalYearCode: string;
  runDate: string;
  totalPaisa: number;
  status: 'Posted' | 'Reversed';
  items: Array<{ assetCode: string; assetName: string; amountPaisa: number }>;
}

interface PeriodOption {
  _id: string;
  name: string;
  status: string;
  year: number;
  month: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  FA_TRAINING_EQUIPMENT: '1310 · Training Equipment',
  FA_FURNITURE: '1320 · Furniture & Fixtures',
  FA_COMPUTER: '1330 · Computer & Electronics',
  FA_LEASEHOLD: '1340 · Lease/Building Improvements',
};

export function FixedAssetsView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canWrite = role === 'Admin' || role === 'Accountant';
  const isAdmin = role === 'Admin';

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [runs, setRuns] = useState<DepreciationRunRow[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Search / filter / sort
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortKey, setSortKey] = useState('purchaseDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Add Asset Modal (4-tab layout)
  const [showAdd, setShowAdd] = useState(false);
  const [modalTab, setModalTab] = useState<'purchase' | 'details' | 'depreciation' | 'preview'>(
    'purchase'
  );
  const [submitting, setSubmitting] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultDueStr = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const initialForm = {
    name: '',
    categoryTag: 'FA_TRAINING_EQUIPMENT',
    quantity: '1',
    unitCostTaka: '',
    separateUnits: false,
    serialNumbersText: '',
    serialNumber: '',
    purchaseDate: todayStr,
    depreciationStartDate: todayStr,
    supplier: '',
    location: '',
    condition: 'Good',
    usefulLifeMonths: '36',
    salvageTaka: '0',
    paymentType: 'Paid' as 'Paid' | 'Credit' | 'Opening',
    paymentMethod: 'Bank',
    bankName: '',
    chequeNo: '',
    chequeDate: todayStr,
    reference: '',
    dueDate: defaultDueStr,
    advancePaidTaka: '0',
    openingAccumTaka: '0',
    attachmentUrl: '',
    branch: 'Main',
  };
  const [form, setForm] = useState(initialForm);

  // Depreciation Modal
  const [showDep, setShowDep] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');

  // Dispose Modal
  const [disposeTarget, setDisposeTarget] = useState<AssetRow | null>(null);
  const [disposeForm, setDisposeForm] = useState({
    disposalType: 'Disposed' as 'Disposed' | 'WrittenOff',
    disposalDate: new Date().toISOString().slice(0, 10),
    proceedsTaka: '0',
    paymentMethod: 'Bank',
    note: '',
  });

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [aRes, dRes, pRes] = await Promise.all([
        fetch('/api/accounts/assets'),
        fetch('/api/accounts/depreciation'),
        fetch('/api/accounts/periods'),
      ]);
      const [aJson, dJson, pJson] = await Promise.all([aRes.json(), dRes.json(), pRes.json()]);
      if (!aJson.success) throw new Error(aJson.message || 'Failed to load assets');
      setAssets(aJson.data || []);
      if (dJson.success) setRuns(dJson.data || []);
      if (pJson.success) {
        const pList: PeriodOption[] = Array.isArray(pJson.data)
          ? pJson.data
          : pJson.data?.periods || [];
        setPeriods(pList);
        const firstOpen = pList.find((p) => p.status === 'Open');
        if (firstOpen && !selectedPeriodId) setSelectedPeriodId(firstOpen._id);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading fixed assets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filtered = useMemo(() => {
    const list = assets.filter((a) => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (categoryFilter !== 'All' && a.categoryTag !== categoryFilter) return false;
      return matchesSearch(
        search,
        [
          a.assetCode,
          a.name,
          a.supplier,
          a.location,
          a.serialNumber || '',
          CATEGORY_LABELS[a.categoryTag] || '',
        ]
      );
    });
    return sortTableItems(list, sortKey, sortDir, {
      purchaseDate: (a) => a.purchaseDate,
      assetCode: (a) => a.assetCode,
      costPaisa: (a) => a.costPaisa,
      nbv: (a) => a.costPaisa - (a.accumulatedDepreciationPaisa || 0),
    });
  }, [assets, search, statusFilter, categoryFilter, sortKey, sortDir]);

  const totals = useMemo(() => {
    let cost = 0;
    let accum = 0;
    let nbv = 0;
    for (const a of filtered) {
      if (a.status === 'Active') {
        const ac = a.accumulatedDepreciationPaisa || 0;
        cost += a.costPaisa;
        accum += ac;
        nbv += a.costPaisa - ac;
      }
    }
    return { cost, accum, nbv };
  }, [filtered]);

  // Computed Phase 1 & Phase 2 preview/validation values
  const parsedQty = Math.max(1, Math.floor(Number(form.quantity || 1)));
  const unitCostPaisa = takaToPaisa(Number(form.unitCostTaka || 0) || 0);
  const totalCostPaisa = unitCostPaisa * parsedQty;
  const salvagePaisa = takaToPaisa(Number(form.salvageTaka || 0) || 0);
  const advancePaisa =
    form.paymentType === 'Credit' ? takaToPaisa(Number(form.advancePaidTaka || 0) || 0) : 0;
  const openingAccumPaisa =
    form.paymentType === 'Opening' ? takaToPaisa(Number(form.openingAccumTaka || 0) || 0) : 0;
  const showPaymentFields =
    form.paymentType === 'Paid' || (form.paymentType === 'Credit' && advancePaisa > 0);
  const serialLines = form.serialNumbersText
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const purchaseTabError = useMemo(() => {
    if (!form.name.trim()) return 'Asset name is required';
    if (unitCostPaisa <= 0) return 'Unit cost must be greater than zero';
    if (form.separateUnits && parsedQty > 1 && serialLines.length > 0 && serialLines.length !== parsedQty) {
      return `Serial numbers (${serialLines.length}) must match quantity (${parsedQty}) or be empty`;
    }
    if (form.paymentType === 'Credit') {
      if (!form.dueDate) return 'Due Date is required for On Credit';
      if (advancePaisa < 0 || advancePaisa >= totalCostPaisa) {
        return 'Advance Paid must be >= 0 and less than Total Cost';
      }
    }
    if (showPaymentFields && form.paymentMethod === 'Cheque' && !form.chequeNo.trim()) {
      return 'Cheque No. is required for Cheque payment';
    }
    if (form.paymentType === 'Opening') {
      if (openingAccumPaisa < 0 || openingAccumPaisa > totalCostPaisa - salvagePaisa) {
        return 'Opening Accum. Depreciation cannot exceed (Total Cost - Salvage)';
      }
    }
    return '';
  }, [
    form.name,
    form.separateUnits,
    form.paymentType,
    form.dueDate,
    form.paymentMethod,
    form.chequeNo,
    unitCostPaisa,
    parsedQty,
    serialLines.length,
    advancePaisa,
    totalCostPaisa,
    openingAccumPaisa,
    salvagePaisa,
    showPaymentFields,
  ]);

  const depreciationTabError = useMemo(() => {
    const life = Math.floor(Number(form.usefulLifeMonths || 0));
    if (!Number.isFinite(life) || life < 1) return 'Useful life must be at least 1 month';
    if (salvagePaisa < 0 || salvagePaisa > totalCostPaisa) {
      return 'Salvage value must be between 0 and Total Cost';
    }
    return '';
  }, [form.usefulLifeMonths, salvagePaisa, totalCostPaisa]);

  const voucherPreviewLines = useMemo(() => {
    const assetAccLabel = CATEGORY_LABELS[form.categoryTag] || form.categoryTag;
    const rows: Array<{ side: 'Dr' | 'Cr'; account: string; amountPaisa: number }> = [
      { side: 'Dr', account: assetAccLabel, amountPaisa: totalCostPaisa },
    ];
    if (form.paymentType === 'Paid') {
      rows.push({
        side: 'Cr',
        account: `${form.paymentMethod} Deposit Account`,
        amountPaisa: totalCostPaisa,
      });
    } else if (form.paymentType === 'Credit') {
      if (advancePaisa > 0) {
        rows.push({
          side: 'Cr',
          account: `${form.paymentMethod} Deposit Account (Advance)`,
          amountPaisa: advancePaisa,
        });
      }
      rows.push({
        side: 'Cr',
        account: '2130 · Vendor & Supplier Payable',
        amountPaisa: Math.max(0, totalCostPaisa - advancePaisa),
      });
    } else {
      if (openingAccumPaisa > 0) {
        rows.push({
          side: 'Cr',
          account: '1390 · Accumulated Depreciation',
          amountPaisa: openingAccumPaisa,
        });
      }
      rows.push({
        side: 'Cr',
        account: '3900 · Opening Balance Equity',
        amountPaisa: Math.max(0, totalCostPaisa - openingAccumPaisa),
      });
    }
    return rows;
  }, [form.categoryTag, form.paymentType, form.paymentMethod, totalCostPaisa, advancePaisa, openingAccumPaisa]);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purchaseTabError) {
      setError(purchaseTabError);
      setModalTab('purchase');
      return;
    }
    if (depreciationTabError) {
      setError(depreciationTabError);
      setModalTab('depreciation');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/accounts/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          categoryTag: form.categoryTag,
          quantity: parsedQty,
          unitCostPaisa,
          costPaisa: totalCostPaisa,
          separateUnits: form.separateUnits && parsedQty > 1,
          serialNumbers: form.separateUnits && parsedQty > 1 ? serialLines : undefined,
          serialNumber: !form.separateUnits ? form.serialNumber : undefined,
          purchaseDate: form.purchaseDate,
          depreciationStartDate: form.depreciationStartDate || form.purchaseDate,
          supplier: form.supplier,
          location: form.location,
          condition: form.condition,
          usefulLifeMonths: Number(form.usefulLifeMonths || 36),
          salvageValuePaisa: salvagePaisa,
          paymentType: form.paymentType,
          paymentMethod: showPaymentFields ? form.paymentMethod : undefined,
          bankName: showPaymentFields ? form.bankName : undefined,
          chequeNo: showPaymentFields && form.paymentMethod === 'Cheque' ? form.chequeNo : undefined,
          chequeDate:
            showPaymentFields && form.paymentMethod === 'Cheque' ? form.chequeDate : undefined,
          reference: showPaymentFields ? form.reference : undefined,
          dueDate: form.paymentType === 'Credit' ? form.dueDate : undefined,
          advancePaidPaisa: form.paymentType === 'Credit' ? advancePaisa : 0,
          openingAccumulatedPaisa: form.paymentType === 'Opening' ? openingAccumPaisa : 0,
          attachmentUrl: form.attachmentUrl,
          branch: form.branch,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to register asset');
      setShowAdd(false);
      setModalTab('purchase');
      setForm(initialForm);
      setMessage('Fixed asset registered and posted to General Ledger.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to register asset');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunDepreciation = async () => {
    if (!selectedPeriodId) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/accounts/depreciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId: selectedPeriodId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Depreciation run failed');
      setMessage('Monthly depreciation posted to General Ledger.');
      setShowDep(false);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Depreciation run failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverseDepRun = async (runId: string) => {
    const reason = window.prompt('Enter reason for reversing this depreciation run (min 3 chars):');
    if (!reason || reason.trim().length < 3) return;
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/accounts/depreciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse', runId, reason }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to reverse depreciation run');
      setMessage('Depreciation run reversed and asset balances restored.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to reverse depreciation run');
    }
  };

  const handleReverseAsset = async (assetId: string) => {
    const reason = window.prompt('Enter reason for reversing this asset purchase (min 3 chars):');
    if (!reason || reason.trim().length < 3) return;
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/accounts/assets/${assetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse', reason }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to reverse asset purchase');
      setMessage('Asset purchase reversed in General Ledger.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to reverse asset purchase');
    }
  };

  const handleDispose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposeTarget) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/accounts/assets/${disposeTarget._id}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposalType: disposeForm.disposalType,
          disposalDate: disposeForm.disposalDate,
          proceedsPaisa:
            disposeForm.disposalType === 'WrittenOff'
              ? 0
              : takaToPaisa(Number(disposeForm.proceedsTaka || 0)),
          paymentMethod: disposeForm.paymentMethod,
          note: disposeForm.note,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Disposal failed');
      setDisposeTarget(null);
      setMessage('Asset disposal posted to General Ledger.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Disposal failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportExcel = async () => {
    await downloadExcel({
      filename: 'fixed-assets-register',
      sheetName: 'Fixed Assets',
      headers: [
        'Asset Code',
        'Name',
        'Category',
        'Qty',
        'Purchase Date',
        'Location',
        'Condition',
        'Cost (BDT)',
        'Accum. Depr. (BDT)',
        'Net Book Value (BDT)',
        'Status',
      ],
      rows: filtered.map((a) => [
        a.assetCode,
        a.name,
        CATEGORY_LABELS[a.categoryTag] || a.categoryTag,
        a.quantity,
        formatDateDMY(a.purchaseDate),
        a.location || '-',
        a.condition,
        paisaToTaka(a.costPaisa),
        paisaToTaka(a.accumulatedDepreciationPaisa || 0),
        paisaToTaka(a.costPaisa - (a.accumulatedDepreciationPaisa || 0)),
        a.status,
      ]),
    });
  };

  const handlePrint = () => {
    printTableReport({
      title: 'Fixed Asset Register',
      subtitle: 'CodeZenX ERP — Accounts Module',
      headers: [
        'Code',
        'Name',
        'Category',
        'Purchase Date',
        'Cost (BDT)',
        'Accum. Depr.',
        'NBV (BDT)',
        'Status',
      ],
      rows: filtered.map((a) => [
        a.assetCode,
        a.name,
        CATEGORY_LABELS[a.categoryTag] || a.categoryTag,
        formatDateDMY(a.purchaseDate),
        formatPaisaBDT(a.costPaisa),
        formatPaisaBDT(a.accumulatedDepreciationPaisa || 0),
        formatPaisaBDT(a.costPaisa - (a.accumulatedDepreciationPaisa || 0)),
        a.status,
      ]),
      rightAlignCols: [4, 5, 6],
      landscape: true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            Fixed Assets & Depreciation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Register training equipment, computers, furniture & leasehold assets; run monthly straight-line depreciation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowDep(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
            >
              <Play className="w-3.5 h-3.5" /> Depreciation Runs
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => {
                setError('');
                setModalTab('purchase');
                setShowAdd(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="w-3.5 h-3.5" /> Register Asset
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] uppercase font-semibold text-slate-500">Active Asset Cost</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{formatPaisaBDT(totals.cost)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] uppercase font-semibold text-slate-500">Accumulated Depreciation</div>
          <div className="text-lg font-bold text-amber-700 mt-1">{formatPaisaBDT(totals.accum)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] uppercase font-semibold text-slate-500">Net Book Value</div>
          <div className="text-lg font-bold text-emerald-700 mt-1">{formatPaisaBDT(totals.nbv)}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search code, asset name, supplier, location..."
          totalCount={assets.length}
          filteredCount={filtered.length}
          sortKey={sortKey}
          sortDir={sortDir}
          sortOptions={[
            { value: 'purchaseDate', label: 'Purchase Date' },
            { value: 'assetCode', label: 'Asset Code' },
            { value: 'costPaisa', label: 'Cost' },
            { value: 'nbv', label: 'Net Book Value' },
          ]}
          onSortChange={(k, d) => {
            setSortKey(k);
            setSortDir(d);
          }}
          hasActiveFilters={statusFilter !== 'All' || categoryFilter !== 'All' || Boolean(search)}
          onReset={() => {
            setSearch('');
            setStatusFilter('All');
            setCategoryFilter('All');
          }}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          filters={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
              >
                <option value="All">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Disposed">Disposed</option>
                <option value="WrittenOff">WrittenOff</option>
              </select>
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <th className="py-2.5 px-2">Code</th>
                <th className="py-2.5 px-2">Asset & Location</th>
                <th className="py-2.5 px-2">Category</th>
                <th className="py-2.5 px-2">Purchased</th>
                <th className="py-2.5 px-2 text-right">Cost</th>
                <th className="py-2.5 px-2 text-right">Accum. Depr.</th>
                <th className="py-2.5 px-2 text-right">Net Book Value</th>
                <th className="py-2.5 px-2">Status</th>
                {isAdmin && <th className="py-2.5 px-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Loading fixed assets...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No fixed assets found.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => {
                  const nbv = a.costPaisa - (a.accumulatedDepreciationPaisa || 0);
                  return (
                    <tr key={a._id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-2 font-mono font-semibold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span>{a.assetCode}</span>
                          {(a.paymentType === 'Opening' || a.isPreExisting) && (
                            <Badge variant="purple">Opening</Badge>
                          )}
                        </div>
                        <div className="text-[10px] font-normal text-slate-400">
                          {a.paymentType}
                          {a.serialNumber ? ` · SN: ${a.serialNumber}` : ''}
                          {a.attachmentUrl && (
                            <>
                              {' · '}
                              <a
                                href={a.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 underline"
                              >
                                Doc ↗
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-slate-900">
                          {a.name} {a.quantity > 1 ? `(x${a.quantity})` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {a.location || 'Unassigned'} · {a.condition}
                          {a.supplier ? ` · ${a.supplier}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {CATEGORY_LABELS[a.categoryTag] || a.categoryTag}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {formatDateDMY(a.purchaseDate)}
                        <div className="text-[10px] text-slate-400">{a.usefulLifeMonths} mo life</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-slate-900">
                        {formatPaisaBDT(a.costPaisa)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-amber-700">
                        {formatPaisaBDT(a.accumulatedDepreciationPaisa || 0)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-emerald-700">
                        {formatPaisaBDT(nbv)}
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge
                          variant={
                            a.status === 'Active'
                              ? 'success'
                              : a.status === 'Disposed'
                              ? 'info'
                              : 'warning'
                          }
                        >
                          {a.status}
                        </Badge>
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-2 text-right space-x-1 whitespace-nowrap">
                          {a.status === 'Active' &&
                            ((a.accumulatedDepreciationPaisa || 0) === 0 || a.isPreExisting) && (
                            <button
                              onClick={() => handleReverseAsset(a._id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-amber-200 text-amber-700 hover:bg-amber-50"
                            >
                              <RotateCcw className="w-3 h-3" /> Reverse
                            </button>
                          )}
                          {a.status === 'Active' && (
                            <button
                              onClick={() => {
                                setDisposeTarget(a);
                                setDisposeForm({
                                  disposalType: 'Disposed',
                                  disposalDate: new Date().toISOString().slice(0, 10),
                                  proceedsTaka: '0',
                                  paymentMethod: 'Bank',
                                  note: '',
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3 h-3" /> Dispose
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Asset Modal (4-tab layout) */}
      <Modal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title="Register Fixed Asset"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateAsset} className="space-y-4 text-xs">
          {/* 4-Tab Bar */}
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
            {[
              { key: 'purchase', label: '1. Purchase', hasErr: Boolean(purchaseTabError) },
              { key: 'details', label: '2. Asset Details', hasErr: false },
              { key: 'depreciation', label: '3. Depreciation', hasErr: Boolean(depreciationTabError) },
              { key: 'preview', label: '4. Preview', hasErr: false },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() =>
                  setModalTab(t.key as 'purchase' | 'details' | 'depreciation' | 'preview')
                }
                className={`px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition ${
                  modalTab === t.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{t.label}</span>
                {t.hasErr && (
                  <span
                    className="w-2 h-2 rounded-full bg-rose-500"
                    title="Tab has validation issues"
                  />
                )}
              </button>
            ))}
          </div>

          {modalTab === 'purchase' && (
            <div className="space-y-3">
              {purchaseTabError && (
                <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px]">
                  {purchaseTabError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Asset Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., TIG Welding Machine Set"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category *</label>
                  <select
                    value={form.categoryTag}
                    onChange={(e) => setForm({ ...form, categoryTag: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {form.paymentType === 'Opening' ? 'Cutover Date *' : 'Purchase Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.purchaseDate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purchaseDate: e.target.value,
                        depreciationStartDate:
                          form.paymentType === 'Opening'
                            ? e.target.value
                            : form.depreciationStartDate,
                      })
                    }
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Acquisition Mode *</label>
                  <select
                    value={form.paymentType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        paymentType: e.target.value as 'Paid' | 'Credit' | 'Opening',
                      })
                    }
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                  >
                    <option value="Paid">Paid Now (Cash / Bank / MFS)</option>
                    <option value="Credit">On Credit (Creates Vendor Bill)</option>
                    <option value="Opening">Opening Asset (already owned)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Unit Cost (BDT) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={form.unitCostTaka}
                    onChange={(e) => setForm({ ...form, unitCostTaka: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Total Cost</label>
                    <div className="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-2 font-semibold text-slate-900">
                      {formatPaisaBDT(totalCostPaisa)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Separate record per unit (when quantity > 1) */}
              {parsedQty > 1 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.separateUnits}
                      onChange={(e) => setForm({ ...form, separateUnits: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    Create separate record for each unit ({parsedQty} assets: FA-XXXX-01 ..{' '}
                    {String(parsedQty).padStart(2, '0')})
                  </label>
                  {form.separateUnits && (
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Per-Unit Serial Numbers (optional, one per line — leave blank or provide{' '}
                        {parsedQty} lines)
                      </label>
                      <textarea
                        rows={3}
                        value={form.serialNumbersText}
                        onChange={(e) => setForm({ ...form, serialNumbersText: e.target.value })}
                        placeholder={`SN-001\nSN-002`}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono text-[11px]"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Change B: On Credit fields */}
              {form.paymentType === 'Credit' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-amber-50/70 border border-amber-200">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Due Date *</label>
                    <input
                      type="date"
                      required
                      value={form.dueDate}
                      onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Advance Paid (BDT, optional)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.advancePaidTaka}
                      onChange={(e) => setForm({ ...form, advancePaidTaka: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Change D: Opening Asset fields */}
              {form.paymentType === 'Opening' && (
                <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-200">
                  <label className="block font-medium text-slate-700 mb-1">
                    Accumulated Depreciation to Date (BDT)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.openingAccumTaka}
                    onChange={(e) => setForm({ ...form, openingAccumTaka: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                  />
                  <div className="text-[11px] text-indigo-700 mt-1">
                    Remaining NBV: {formatPaisaBDT(Math.max(0, totalCostPaisa - openingAccumPaisa))} ·
                    No cash or bank movement.
                  </div>
                </div>
              )}

              {/* Change A: Conditional Payment Fields */}
              {showPaymentFields && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-200">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Payment Method {form.paymentType === 'Credit' ? '(Advance)' : '*'}
                    </label>
                    <select
                      value={form.paymentMethod}
                      onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank">Bank</option>
                      <option value="Cheque">Cheque</option>
                      <option value="bKash">bKash</option>
                      <option value="Nagad">Nagad</option>
                    </select>
                  </div>

                  {(form.paymentMethod === 'Bank' || form.paymentMethod === 'Cheque') && (
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Bank Name</label>
                      <input
                        value={form.bankName}
                        onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                        placeholder="e.g., Dutch-Bangla Bank"
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                      />
                    </div>
                  )}

                  {form.paymentMethod === 'Cheque' && (
                    <>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Cheque No. *
                        </label>
                        <input
                          required
                          value={form.chequeNo}
                          onChange={(e) => setForm({ ...form, chequeNo: e.target.value })}
                          placeholder="e.g., CHQ-445512"
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Cheque Date</label>
                        <input
                          type="date"
                          value={form.chequeDate}
                          onChange={(e) => setForm({ ...form, chequeDate: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                        />
                      </div>
                    </>
                  )}

                  {form.paymentMethod !== 'Cash' && (
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        {form.paymentMethod === 'bKash' || form.paymentMethod === 'Nagad'
                          ? 'Transaction / Reference No.'
                          : 'Reference No.'}
                      </label>
                      <input
                        value={form.reference}
                        onChange={(e) => setForm({ ...form, reference: e.target.value })}
                        placeholder="TrxID / Transfer Ref"
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Live Voucher Summary Panel on Purchase Tab */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1.5">
                  Voucher Preview (Dr / Cr)
                </div>
                <div className="space-y-1">
                  {voucherPreviewLines.map((line, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-700">
                        <span
                          className={`inline-block w-7 font-bold ${
                            line.side === 'Dr' ? 'text-emerald-700' : 'text-indigo-700'
                          }`}
                        >
                          {line.side}
                        </span>
                        {line.account}
                      </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {formatPaisaBDT(line.amountPaisa)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {modalTab === 'details' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {form.paymentType !== 'Opening' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Supplier / Vendor</label>
                  <input
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                  />
                </div>
              )}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Location (Room / Center)
                </label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Condition</label>
                <select
                  value={form.condition}
                  onChange={(e) => setForm({ ...form, condition: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                >
                  <option value="Good">Good</option>
                  <option value="NeedsRepair">Needs Repair</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </div>
              {!form.separateUnits && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Serial Number (Optional)
                  </label>
                  <input
                    value={form.serialNumber}
                    onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                  />
                </div>
              )}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Branch</label>
                <input
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                />
              </div>
              <div className="sm:col-span-2">
                <DocumentUploadField
                  label="Invoice / Supporting Document (Optional)"
                  value={form.attachmentUrl}
                  onChange={(url) => setForm({ ...form, attachmentUrl: url })}
                />
              </div>
            </div>
          )}

          {modalTab === 'depreciation' && (
            <div className="space-y-3">
              {depreciationTabError && (
                <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px]">
                  {depreciationTabError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Depreciation Start Date
                  </label>
                  <input
                    type="date"
                    value={
                      form.paymentType === 'Opening'
                        ? form.purchaseDate
                        : form.depreciationStartDate
                    }
                    disabled={form.paymentType === 'Opening'}
                    onChange={(e) =>
                      setForm({ ...form, depreciationStartDate: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Useful Life (Months) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.usefulLifeMonths}
                    onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Salvage Value (BDT)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.salvageTaka}
                    onChange={(e) => setForm({ ...form, salvageTaka: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                  />
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                <div className="font-semibold text-slate-800">Straight-Line Depreciation Preview</div>
                <div>
                  Depreciable Base:{' '}
                  <strong>{formatPaisaBDT(Math.max(0, totalCostPaisa - salvagePaisa))}</strong>
                </div>
                <div>
                  Estimated Monthly Depreciation:{' '}
                  <strong>
                    {formatPaisaBDT(
                      Math.floor(
                        Math.max(0, totalCostPaisa - salvagePaisa) /
                          Math.max(1, Math.floor(Number(form.usefulLifeMonths || 1)))
                      )
                    )}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {modalTab === 'preview' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500">Asset:</span>{' '}
                  <strong>{form.name || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Mode:</span>{' '}
                  <strong>{form.paymentType}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Quantity:</span>{' '}
                  <strong>
                    {parsedQty} {form.separateUnits && parsedQty > 1 ? '(Separate Units)' : '(Single Record)'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Total Cost:</span>{' '}
                  <strong>{formatPaisaBDT(totalCostPaisa)}</strong>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1.5">
                  Journal Voucher to Post
                </div>
                {voucherPreviewLines.map((line, i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span>
                      <strong>{line.side}</strong> {line.account}
                    </span>
                    <span className="font-mono font-semibold">{formatPaisaBDT(line.amountPaisa)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Register & Post'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Depreciation Modal */}
      <Modal
        isOpen={showDep}
        onClose={() => setShowDep(false)}
        title="Monthly Depreciation Runs"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="flex flex-wrap items-end gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex-1 min-w-[200px]">
              <label className="block font-medium text-slate-700 mb-1">Select Open Period</label>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="">-- Choose Period --</option>
                {periods.map((p) => (
                  <option key={p._id} value={p._id} disabled={p.status !== 'Open'}>
                    {p.name} ({p.status})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleRunDepreciation}
              disabled={!selectedPeriodId || submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Run Depreciation
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3">Assets</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No depreciation runs posted yet.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => (
                    <tr key={r._id}>
                      <td className="py-2 px-3 font-medium">{r.periodName}</td>
                      <td className="py-2 px-3">{r.items?.length || 0}</td>
                      <td className="py-2 px-3 text-right font-semibold">
                        {formatPaisaBDT(r.totalPaisa)}
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={r.status === 'Posted' ? 'success' : 'warning'}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {r.status === 'Posted' && (
                          <button
                            onClick={() => handleReverseDepRun(r._id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                          >
                            <RotateCcw className="w-3 h-3" /> Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Dispose Asset Modal */}
      <Modal
        isOpen={Boolean(disposeTarget)}
        onClose={() => setDisposeTarget(null)}
        title={`Dispose / Write-Off ${disposeTarget?.assetCode || ''}`}
      >
        <form onSubmit={handleDispose} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Action Type</label>
            <select
              value={disposeForm.disposalType}
              onChange={(e) =>
                setDisposeForm({
                  ...disposeForm,
                  disposalType: e.target.value as 'Disposed' | 'WrittenOff',
                })
              }
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
            >
              <option value="Disposed">Sold / Disposed</option>
              <option value="WrittenOff">Written Off (Scrap / Damaged)</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Disposal Date</label>
            <input
              type="date"
              required
              value={disposeForm.disposalDate}
              onChange={(e) => setDisposeForm({ ...disposeForm, disposalDate: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          {disposeForm.disposalType === 'Disposed' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Sale Proceeds (BDT)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={disposeForm.proceedsTaka}
                  onChange={(e) => setDisposeForm({ ...disposeForm, proceedsTaka: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Deposit To</label>
                <select
                  value={disposeForm.paymentMethod}
                  onChange={(e) =>
                    setDisposeForm({ ...disposeForm, paymentMethod: e.target.value })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                >
                  <option value="Bank">Bank</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="block font-medium text-slate-700 mb-1">Note</label>
            <input
              value={disposeForm.note}
              onChange={(e) => setDisposeForm({ ...disposeForm, note: e.target.value })}
              placeholder="Reason or buyer details"
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setDisposeTarget(null)}
              className="px-3 py-1.5 rounded-lg border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-rose-600 text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Confirm Disposal'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

