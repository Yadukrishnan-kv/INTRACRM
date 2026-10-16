import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { CheckboxField, FormActions, FormError, FormGrid, SelectField, TextArea, TextField } from '../../components/form';
import { ConfirmModal } from '../../components/Modal';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { adminApi, adminKeys, CATALOG_KINDS, type CatalogItem, type CatalogKind } from './api';
import {
  catalogKindLabel,
  catalogPayload,
  catalogSubtitle,
  draftFromItem,
  emptyCatalogDraft,
  isCatalogKind,
  kindSupportsActive,
  validateCatalogDraft,
  withName,
  withStatusFlag,
  type CatalogDraft,
} from './logic';
import { BackLink, MenuGroup } from './shared';

const listKey = (kind: CatalogKind) => [...adminKeys.catalog, kind] as const;

/** Taxes are edited in bulk on the taxes settings page, as on mobile. */
export function catalogKindPath(kind: CatalogKind): string {
  return kind === 'taxes' ? '/settings/general/taxes' : `/catalog/${kind}`;
}

/* ---------- Hub ---------- */

/** Mobile CatalogHubPage: every catalog kind with its item count. */
export function CatalogHubPage() {
  const query = useQuery({ queryKey: [...adminKeys.catalog, 'overview'], queryFn: adminApi.catalogOverview });
  const count = (kind: CatalogKind) => query.data?.find((k) => k.code === kind)?.count;

  return (
    <>
      <BackLink to="/settings/general" label="General settings" />
      <PageHeader title="Catalog" subtitle="Products, lead sources, statuses, qualities, warranty periods and taxes." />
      {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
      <div className="admin-grid">
        <MenuGroup
          title="Catalog"
          links={CATALOG_KINDS.map((kind) => {
            const n = count(kind);
            return {
              to: catalogKindPath(kind),
              title: catalogKindLabel(kind),
              subtitle: query.isLoading ? 'Loading…' : `${n ?? 0} ${n === 1 ? 'item' : 'items'}`,
            };
          })}
        />
      </div>
    </>
  );
}

function useKind(): CatalogKind | null {
  const { kind } = useParams();
  return isCatalogKind(kind) ? kind : null;
}

/* ---------- List ---------- */

/** Mobile CatalogListPage: every item (active and inactive) with edit and delete. */
export function CatalogListPage() {
  const kind = useKind();
  if (!kind) return <EmptyState>Unknown catalog type.</EmptyState>;
  return <CatalogList kind={kind} />;
}

function CatalogList({ kind }: { kind: CatalogKind }) {
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<CatalogItem | null>(null);
  const query = useQuery({ queryKey: listKey(kind), queryFn: () => adminApi.catalogList(kind) });
  const remove = useApiMutation((id: string) => adminApi.catalogDelete(kind, id), {
    success: 'Deleted',
    invalidate: [adminKeys.catalog],
    onSuccess: () => setPendingDelete(null),
  });
  const label = catalogKindLabel(kind);

  return (
    <>
      <BackLink to="/catalog" label="Catalog" />
      <PageHeader
        title={label}
        actions={
          <Link className="btn btn-primary" to={`/catalog/${kind}/create`}>
            Add
          </Link>
        }
      />
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data!.length === 0 ? (
        <EmptyState>Nothing here yet. Add the first {label.toLowerCase()} item.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Details</th>
                {kind === 'products' ? <th className="num">Price</th> : <th className="num">Order</th>}
                {kindSupportsActive(kind) ? <th>Status</th> : null}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {query.data!.map((item) => (
                <tr key={item.id} className="row-link" onClick={() => navigate(`/catalog/${kind}/${item.id}/edit`)}>
                  <td>
                    <Link to={`/catalog/${kind}/${item.id}/edit`} onClick={(e) => e.stopPropagation()}>
                      {item.name}
                    </Link>
                    {kind === 'products' && item.description ? (
                      <div className="muted small admin-clamp">{item.description}</div>
                    ) : null}
                  </td>
                  <td className="muted small">{catalogSubtitle(kind, item) || '—'}</td>
                  <td className="num">{kind === 'products' ? formatMoney(item.unitPriceMinor, item.currency) : (item.sortOrder ?? 0)}</td>
                  {kindSupportsActive(kind) ? (
                    <td>
                      <Badge value={item.isActive ? 'active' : 'inactive'} tone={item.isActive ? 'success' : 'neutral'} />
                    </td>
                  ) : null}
                  <td>
                    <div className="btn-row admin-row-actions">
                      <Link
                        className="btn btn-ghost btn-sm"
                        to={`/catalog/${kind}/${item.id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost btn-ghost-danger btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(item);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmModal
        open={!!pendingDelete}
        title={`Delete ${pendingDelete?.name ?? ''}?`}
        message="Items in use cannot be deleted. Deactivate them instead."
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
}

/* ---------- Form ---------- */

/** Mobile CatalogFormPage: one form whose fields depend on the kind. */
export function CatalogFormPage() {
  const kind = useKind();
  if (!kind) return <EmptyState>Unknown catalog type.</EmptyState>;
  return <CatalogForm kind={kind} />;
}

function CatalogForm({ kind }: { kind: CatalogKind }) {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CatalogDraft>(emptyCatalogDraft);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const label = catalogKindLabel(kind);
  const backTo = catalogKindPath(kind);

  const items = useQuery({ queryKey: listKey(kind), queryFn: () => adminApi.catalogList(kind), enabled: isEdit });
  const lookups = useQuery({
    queryKey: [...adminKeys.catalog, 'lookups'],
    queryFn: adminApi.catalogLookups,
    enabled: kind === 'products',
  });
  const categories = useQuery({
    queryKey: listKey('categories'),
    queryFn: () => adminApi.catalogList('categories'),
    enabled: kind === 'categories',
  });
  const existing = isEdit ? items.data?.find((i) => i.id === id) : undefined;

  useEffect(() => {
    if (existing && !loaded) {
      setDraft(draftFromItem(existing));
      setLoaded(true);
    }
  }, [existing, loaded]);

  const save = useApiMutation(
    (d: CatalogDraft) =>
      isEdit ? adminApi.catalogUpdate(kind, id!, catalogPayload(kind, d, true)) : adminApi.catalogCreate(kind, catalogPayload(kind, d, false)),
    { success: isEdit ? 'Saved' : 'Created', invalidate: [adminKeys.catalog], onSuccess: () => navigate(backTo) },
  );

  if (isEdit && items.isLoading) return <Spinner />;
  if (isEdit && items.isError) return <ErrorState error={items.error} onRetry={() => items.refetch()} />;
  if (isEdit && !existing) return <EmptyState>This item no longer exists.</EmptyState>;

  const set = (patch: Partial<CatalogDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const categoryOptions = (kind === 'products' ? (lookups.data?.categories ?? []) : (categories.data ?? []))
    .filter((c) => c.id !== id)
    .map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (inactive)` }));
  const periodOptions = (lookups.data?.warrantyPeriods ?? []).map((p) => ({ value: p.id, label: p.name }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validateCatalogDraft(kind, draft);
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate(draft);
  }

  return (
    <>
      <BackLink to={backTo} label={label} />
      <PageHeader title={`${isEdit ? 'Edit' : 'Add'} ${label}`} subtitle={isEdit ? existing?.name : undefined} />
      <form className="card stack" onSubmit={onSubmit} noValidate>
        <FormGrid>
          <TextField
            label="Name"
            required
            autoFocus={!isEdit}
            value={draft.name}
            maxLength={kind === 'products' ? 160 : 120}
            error={errors.name}
            onValue={(v) => setDraft((d) => withName(kind, d, v, isEdit))}
          />
          {kind === 'products' ? (
            <TextField label="SKU" required value={draft.sku} maxLength={40} error={errors.sku} onValue={(v) => set({ sku: v })} />
          ) : (
            <TextField
              label="Code"
              required
              value={draft.code}
              maxLength={80}
              error={errors.code}
              hint="Lowercase letters, numbers and underscores"
              onValue={(v) => set({ code: v, codeTouched: true })}
            />
          )}

          {kind === 'products' ? (
            <>
              <SelectField
                label="Category"
                placeholder="None"
                value={draft.categoryId}
                options={categoryOptions}
                onValue={(v) => set({ categoryId: v })}
              />
              <SelectField
                label="Warranty period"
                placeholder="None"
                value={draft.warrantyPeriodId}
                options={periodOptions}
                onValue={(v) => set({ warrantyPeriodId: v })}
              />
              <TextField
                label="Unit price (₹)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={draft.price}
                error={errors.unitPriceMinor}
                onValue={(v) => set({ price: v })}
              />
              <div className="span-2">
                <TextArea
                  label="Description"
                  rows={3}
                  value={draft.description}
                  maxLength={2000}
                  error={errors.description}
                  onValue={(v) => set({ description: v })}
                />
              </div>
            </>
          ) : null}

          {kind === 'categories' ? (
            <SelectField
              label="Parent category"
              placeholder="None"
              value={draft.parentId}
              options={categoryOptions}
              onValue={(v) => set({ parentId: v })}
            />
          ) : null}

          {kind === 'warranty-periods' ? (
            <TextField
              label="Warranty months"
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={360}
              value={draft.months}
              error={errors.months}
              onValue={(v) => set({ months: v.replace(/\D/g, '') })}
            />
          ) : null}

          {kind === 'taxes' ? (
            <TextField
              label="Tax %"
              type="number"
              inputMode="decimal"
              required
              min={0}
              max={100}
              step="0.01"
              value={draft.ratePercent}
              error={errors.ratePercent}
              onValue={(v) => set({ ratePercent: v })}
            />
          ) : null}

          {kind === 'lead-statuses' ? (
            <TextField
              label="Win probability %"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={draft.winPercent}
              error={errors.winProbabilityBps}
              onValue={(v) => set({ winPercent: v })}
            />
          ) : null}

          {kind !== 'products' ? (
            <TextField
              label="Sort order"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.sortOrder}
              error={errors.sortOrder}
              onValue={(v) => set({ sortOrder: v.replace(/\D/g, '') })}
            />
          ) : null}
        </FormGrid>

        {kind === 'lead-statuses' ? (
          <div>
            <p className="admin-group-title">Outcome</p>
            <div className="btn-row">
              <CheckboxField label="Open" checked={draft.isOpen} onValue={(v) => setDraft((d) => withStatusFlag(d, 'isOpen', v))} />
              <CheckboxField label="Won" checked={draft.isWon} onValue={(v) => setDraft((d) => withStatusFlag(d, 'isWon', v))} />
              <CheckboxField label="Lost" checked={draft.isLost} onValue={(v) => setDraft((d) => withStatusFlag(d, 'isLost', v))} />
            </div>
            {errors.flags ? <small className="field-error">{errors.flags}</small> : null}
          </div>
        ) : null}

        {kindSupportsActive(kind) ? (
          <CheckboxField
            label="Active"
            hint="Inactive items stay on old records but can't be picked for new ones."
            checked={draft.isActive}
            onValue={(v) => set({ isActive: v })}
          />
        ) : null}

        <FormError message={save.error ? errorMessage(save.error) : null} />
        <FormActions>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(backTo)} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </FormActions>
      </form>
    </>
  );
}
