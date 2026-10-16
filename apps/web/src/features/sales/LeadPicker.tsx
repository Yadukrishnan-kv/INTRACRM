import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDebounced } from '../../lib/hooks';
import { salesApi } from './api';

/** Search-as-you-type lead selector (mobile shows a dropdown of recent leads). */
export function LeadPicker({
  value, onChange, error, required, label = 'Lead',
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
  required?: boolean;
  label?: string;
}) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q.trim());
  const leads = useQuery({ queryKey: ['sales-lead-search', debounced], queryFn: () => salesApi.searchLeads(debounced) });
  const options = leads.data ?? [];

  return (
    <div className={`field span-2${error ? ' field-invalid' : ''}`}>
      <span>
        {label}
        {required ? <span className="req" aria-hidden> *</span> : null}
      </span>
      <div className="sales-picker">
        <input type="search" placeholder="Search leads by name, number, phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} aria-invalid={!!error}>
          <option value="">{leads.isLoading ? 'Loading…' : options.length ? 'Choose a lead' : 'No leads found'}</option>
          {value && !options.some((o) => o.id === value) ? <option value={value}>Selected lead</option> : null}
          {options.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.leadNumber} · {lead.title}
              {lead.customerName ? ` (${lead.customerName})` : ''}
            </option>
          ))}
        </select>
      </div>
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}

/** Read-only lead shown when the form was opened with ?leadId=. */
export function LeadSummary({ leadId }: { leadId: string }) {
  const lead = useQuery({ queryKey: ['sales-lead', leadId], queryFn: () => salesApi.lead(leadId) });
  return (
    <div className="field span-2">
      <span>Lead</span>
      <div>
        <Link to={`/leads/${leadId}`}>
          {lead.data ? `${lead.data.leadNumber} · ${lead.data.title}` : lead.isError ? 'Linked lead' : 'Loading…'}
        </Link>
        {lead.data?.customerName ? <span className="muted"> · {lead.data.customerName}</span> : null}
      </div>
    </div>
  );
}
