import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Brand, Spinner } from '../../components/ui';
import { fetchPublicWarranty, fetchPublicWarrantyPdf } from './api';
import { formatDay, parseWarrantyToken, saveBlob } from './logic';
import type { PublicWarranty } from './types';
import './sales.css';

/** Public (no sign-in) warranty verification: /verify-warranty and /verify-warranty/:token. */
export function VerifyWarrantyPage() {
  const { token: routeToken } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(routeToken ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  const token = routeToken ? (parseWarrantyToken(routeToken) ?? routeToken) : null;

  useEffect(() => {
    setCode(routeToken ?? '');
    setInputError(null);
  }, [routeToken]);

  const result = useQuery({
    queryKey: ['public-warranty', token],
    queryFn: ({ signal }) => fetchPublicWarranty(token!, signal),
    enabled: !!token,
    retry: false,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseWarrantyToken(code);
    if (!parsed) {
      setInputError('Enter a valid verification URL or token.');
      return;
    }
    setInputError(null);
    if (parsed === token) void result.refetch();
    else navigate(`/verify-warranty/${encodeURIComponent(parsed)}`);
  }

  return (
    <div className="sales-public">
      <div className="sales-public-inner">
        <Brand caption="Warranty verification" />

        <form className="card stack" onSubmit={onSubmit} noValidate>
          <h1 className="sales-public-title">Verify warranty</h1>
          <p className="muted sales-flush">
            Paste the verification URL printed under the QR code on the card, or type the token.
          </p>
          <label className={`field${inputError ? ' field-invalid' : ''}`}>
            <span>Verification URL or token</span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={!!inputError}
              placeholder="https://…/public/warranty/…"
            />
            {inputError ? <small className="field-error">{inputError}</small> : null}
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={result.isFetching}>
              {result.isFetching ? 'Verifying…' : 'Verify warranty'}
            </button>
            {token ? (
              <Link className="btn btn-ghost" to="/verify-warranty">
                Verify another card
              </Link>
            ) : null}
          </div>
        </form>

        {token && result.isLoading ? <Spinner label="Verifying…" /> : null}
        {token && result.isError ? (
          <div className="card sales-unverified" role="alert">
            <div className="sales-verify-status">
              <span aria-hidden>✕</span> Not verified
            </div>
            <p className="sales-flush">{result.error instanceof Error ? result.error.message : 'Verification failed.'}</p>
          </div>
        ) : null}
        {token && result.data ? <ResultCard card={result.data} token={token} /> : null}

        <p className="muted small sales-center">
          <Link to="/">Staff sign-in</Link>
        </p>
      </div>
    </div>
  );
}

function ResultCard({ card, token }: { card: PublicWarranty; token: string }) {
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const active = card.valid && card.status === 'active';

  async function download() {
    setDownloading(true);
    setPdfError(null);
    try {
      const { blob, filename } = await fetchPublicWarrantyPdf(token);
      saveBlob(blob, filename ?? `${card.cardNumber.replace(/[^\w.-]+/g, '_')}.pdf`);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className={`card ${active ? 'sales-verified' : 'sales-unverified'}`} aria-live="polite">
      <div className="sales-verify-status">
        <span aria-hidden>{active ? '✓' : '✕'}</span> {active ? `Verified · ${card.statusLabel}` : card.statusLabel}
      </div>
      <h2 className="sales-verify-card">{card.cardNumber}</h2>
      {card.tenantName ? <div className="muted">{card.tenantName}</div> : null}
      <dl className="sales-cert-rows">
        {card.customerName ? (
          <>
            <dt>Customer</dt>
            <dd>{card.customerName}</dd>
          </>
        ) : null}
        {card.serialNumber ? (
          <>
            <dt>Serial number</dt>
            <dd>{card.serialNumber}</dd>
          </>
        ) : null}
        {card.purchasedOn ? (
          <>
            <dt>Purchased</dt>
            <dd>{formatDay(card.purchasedOn)}</dd>
          </>
        ) : null}
        <dt>Valid</dt>
        <dd>
          {formatDay(card.warrantyStartOn)} to {formatDay(card.warrantyEndOn)}
        </dd>
        {card.coverageNotes ? (
          <>
            <dt>Coverage</dt>
            <dd>{card.coverageNotes}</dd>
          </>
        ) : null}
      </dl>
      {card.items.length ? (
        <>
          <h3>Covered items</h3>
          <ul className="sales-verify-items">
            {card.items.map((item, i) => (
              <li key={i}>
                {item.description}
                {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                {item.serialNumber ? ` · SN ${item.serialNumber}` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={download} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download warranty PDF'}
        </button>
      </div>
      {pdfError ? <p className="form-error sales-verify-error">{pdfError}</p> : null}
    </section>
  );
}
