# INTRA LEADS Web

Browser console for the INTRA LEADS CRM: React 18, Vite, TypeScript, React Router and
TanStack Query, talking to the NestJS API in `apps/api`. It uses no backend changes; it
speaks the same contract as the mobile client.

## Quick start

```bash
cd apps/web
npm install
npm run dev            # http://localhost:5173
```

In dev, `/api` is proxied to `http://localhost:3000`, so the browser never makes a
cross-origin call. Override the target with `API_PROXY_TARGET` (see `.env.example`).

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with the API proxy |
| `npm run build` | Type-check, then build static files into `dist/` |
| `npm run preview` | Serve `dist/` on port 4173 |
| `npm run typecheck` | `tsc` only |
| `npm test` | Vitest unit tests |

## Deploying

### Vercel

`vercel.json` holds the whole setup:

- In the Vercel project, set **Root Directory** to `apps/web`. The framework (Vite), build command and
  `dist` output come from `vercel.json`. No environment variables are needed.
- `/api/*` is rewritten to `https://intracrm.mobilegear.co.in/api/*`, the same API the mobile app
  uses. Vercel proxies it server-side, so the browser stays same-origin and the API's
  `CORS_ORIGINS` does not change. To point at another API, edit that rewrite.
- Every other path falls back to `index.html`, so client-side routes survive a reload.
  Hashed files under `/assets` are cached for a year; `index.html` is never cached.

CLI: `npx vercel` (preview) or `npx vercel --prod` from `apps/web`.

### Other hosts

`dist/` is plain static files. Either serve it behind the same host as the API with
`/api` routed to it (leave `VITE_API_BASE_URL=/api/v1`), or point
`VITE_API_BASE_URL` at the API's full URL at build time **and** add the web origin to
the API's `CORS_ORIGINS`. Configure the host to fall back to `index.html` for unknown
paths so client-side routes such as `/leads/:id` survive a reload.

## How it talks to the API

`src/api/client.ts` mirrors the mobile interceptors:

- unwraps the `{ data, meta }` envelope, returning `meta.page` for cursor pagination;
- sends `Authorization`, `X-Tenant-Id`, `X-Device-Id`, `X-Request-Id`, and an
  `Idempotency-Key` on unsafe methods;
- on a `401` it refreshes once (single-flight, since the API revokes a reused refresh
  token) and retries; `DEVICE_MISMATCH` or a failed refresh signs the user out;
- turns RFC 7807 problem details into `ApiError` (`status`, `code`, `detail`, `errors`).

The device id is a per-browser UUID in `localStorage`. Tokens are kept in
`sessionStorage`, so closing the tab ends the session.

## Screens

| Route | Permission | Endpoint |
| --- | --- | --- |
| `/login` | public | `POST /auth/login` |
| `/` dashboard | `dashboard:read` | `GET /dashboard/kpis` |
| `/leads` | `lead:read` | `GET /leads` (search, status filter, load more) |
| `/leads/:id` | `lead:read` | `GET /leads/:id` |
| `/staff` | `tenant:manage_users` | `GET /staff` |

Navigation is filtered by the permissions from `GET /me`. A user without
`dashboard:read` lands on Leads.

## Layout

```text
src/
  api/          fetch client, endpoint functions and response types
  auth/         session storage, device id, AuthProvider (/me + permission checks)
  components/   layout shell and shared UI states
  pages/        one file per route
  lib/          formatting (minor units → ₹, basis points → %)
```
