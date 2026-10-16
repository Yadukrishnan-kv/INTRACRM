import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FieldShell = { label: string; error?: string; hint?: ReactNode; required?: boolean };

function Shell({ label, error, hint, required, children }: FieldShell & { children: ReactNode }) {
  return (
    <label className={`field${error ? ' field-invalid' : ''}`}>
      <span>
        {label}
        {required ? <span className="req" aria-hidden> *</span> : null}
      </span>
      {children}
      {error ? <small className="field-error">{error}</small> : hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

export function TextField({
  label, error, hint, onValue, ...rest
}: FieldShell & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onValue: (value: string) => void }) {
  return (
    <Shell label={label} error={error} hint={hint} required={rest.required}>
      <input {...rest} aria-invalid={!!error} onChange={(e) => onValue(e.target.value)} />
    </Shell>
  );
}

export function TextArea({
  label, error, hint, onValue, ...rest
}: FieldShell & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & { onValue: (value: string) => void }) {
  return (
    <Shell label={label} error={error} hint={hint} required={rest.required}>
      <textarea rows={4} {...rest} aria-invalid={!!error} onChange={(e) => onValue(e.target.value)} />
    </Shell>
  );
}

export type Option = { value: string; label: string };

export function SelectField({
  label, error, hint, options, placeholder, onValue, ...rest
}: FieldShell &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
    options: Option[];
    placeholder?: string;
    onValue: (value: string) => void;
  }) {
  return (
    <Shell label={label} error={error} hint={hint} required={rest.required}>
      <select {...rest} aria-invalid={!!error} onChange={(e) => onValue(e.target.value)}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

export function CheckboxField({ label, checked, onValue, hint }: { label: string; checked: boolean; onValue: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onValue(e.target.checked)} />
      <span>
        {label}
        {hint ? <small className="muted"> {hint}</small> : null}
      </span>
    </label>
  );
}

/** Responsive grid for form fields; `span-2` on a child makes it full width. */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-grid">{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

export function FormError({ message }: { message: string | null | undefined }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}

/** <input type="datetime-local"> value ↔ ISO string helpers (local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Rupees typed by a user → integer paise for the API. */
export function rupeesToMinor(value: string): number | undefined {
  const n = Number(value.replace(/,/g, ''));
  return value.trim() === '' || Number.isNaN(n) ? undefined : Math.round(n * 100);
}

export function minorToRupees(minor: number | null | undefined): string {
  return minor === null || minor === undefined ? '' : String(minor / 100);
}
