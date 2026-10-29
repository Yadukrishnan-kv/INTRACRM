-- Demo sales for the incentive / sales-target screens. LOCAL DEV ONLY.
--
-- Revenue achievement is the sum of each rep's won quotations (total_minor,
-- paise) by won_at, and the seed leaves won_at empty, so without this every
-- payout computes to zero. Re-runnable: it replaces its own DEMO-* rows.
--
-- Monthly targets (set through the API by seed-incentives-demo.sh):
--   managers 15,00,000 · business manager 12,00,000
--   executives 10,00,000 · staff 6,00,000

BEGIN;

DELETE FROM quotations WHERE quotation_number LIKE 'DEMO-%';

WITH plan (email, month, target_rupees, pct, deals) AS (
    VALUES
        -- August 2026: closed month, spread across every slab
        ('ada.rao@intraleads.local',      '2026-08', 1500000, 125, 5),
        ('leela.nair@intraleads.local',   '2026-08', 1500000,  95, 4),
        ('kabir.khan@intraleads.local',   '2026-08', 1200000, 102, 3),
        ('dev.menon@intraleads.local',    '2026-08', 1000000, 110, 4),
        ('priya.shah@intraleads.local',   '2026-08', 1000000,  82, 3),
        ('meera.iyer@intraleads.local',   '2026-08', 1000000,  70, 2),
        ('rohan.joshi@intraleads.local',  '2026-08', 1000000, 100, 4),
        ('arjun.patel@intraleads.local',  '2026-08',  600000, 135, 6),
        ('sana.qureshi@intraleads.local', '2026-08',  600000,  88, 3),
        ('vikram.singh@intraleads.local', '2026-08',  600000,  60, 2),
        -- September 2026: closed month, different leaders
        ('ada.rao@intraleads.local',      '2026-09', 1500000, 108, 4),
        ('leela.nair@intraleads.local',   '2026-09', 1500000, 121, 6),
        ('kabir.khan@intraleads.local',   '2026-09', 1200000,  76, 2),
        ('dev.menon@intraleads.local',    '2026-09', 1000000,  92, 3),
        ('priya.shah@intraleads.local',   '2026-09', 1000000, 115, 5),
        ('meera.iyer@intraleads.local',   '2026-09', 1000000, 101, 4),
        ('rohan.joshi@intraleads.local',  '2026-09', 1000000,  84, 3),
        ('arjun.patel@intraleads.local',  '2026-09',  600000,  97, 4),
        ('sana.qureshi@intraleads.local', '2026-09',  600000, 128, 6),
        ('vikram.singh@intraleads.local', '2026-09',  600000,  79, 3),
        -- October 2026: month in progress (first days only)
        ('ada.rao@intraleads.local',      '2026-10', 1500000,  22, 2),
        ('leela.nair@intraleads.local',   '2026-10', 1500000,  15, 2),
        ('kabir.khan@intraleads.local',   '2026-10', 1200000,  18, 2),
        ('dev.menon@intraleads.local',    '2026-10', 1000000,  25, 2),
        ('priya.shah@intraleads.local',   '2026-10', 1000000,  12, 2),
        ('meera.iyer@intraleads.local',   '2026-10', 1000000,  20, 2),
        ('rohan.joshi@intraleads.local',  '2026-10', 1000000,  17, 2),
        ('arjun.patel@intraleads.local',  '2026-10',  600000,  30, 2),
        ('sana.qureshi@intraleads.local', '2026-10',  600000,  14, 2),
        ('vikram.singh@intraleads.local', '2026-10',  600000,   9, 2)
),
rep AS (
    SELECT p.*, m.id AS membership_id, m.tenant_id,
           (p.target_rupees::bigint * 100 * p.pct / 100) AS achieved_minor
    FROM plan p
    JOIN users u ON u.email = p.email AND u.deleted_at IS NULL
    JOIN memberships m ON m.user_id = u.id AND m.deleted_at IS NULL
    JOIN tenants t ON t.id = m.tenant_id AND t.slug = 'intra-demo'
),
deal AS (
    SELECT r.*, g.i,
           -- Equal parts; the last deal takes the rounding remainder.
           CASE WHEN g.i = r.deals
                THEN r.achieved_minor - (r.achieved_minor / r.deals) * (r.deals - 1)
                ELSE r.achieved_minor / r.deals END AS total_minor,
           CASE WHEN r.month = '2026-10'
                THEN (r.month || '-01')::date + (g.i * 2 - 1)               -- 2nd, 4th Oct
                ELSE (r.month || '-01')::date + (2 + (g.i - 1) * (24 / r.deals)) END AS won_on,
           row_number() OVER (ORDER BY r.month, r.email, g.i) AS seq
    FROM rep r
    CROSS JOIN LATERAL generate_series(1, r.deals) AS g(i)
),
lead_pool AS (
    SELECT id, tenant_id, row_number() OVER (ORDER BY created_at, id) AS n,
           count(*) OVER () AS total
    FROM leads
    WHERE deleted_at IS NULL
)
INSERT INTO quotations (
    tenant_id, lead_id, quotation_number, title, status, currency,
    subtotal_minor, tax_minor, total_minor,
    assigned_to_membership_id, sent_at, accepted_at, approved_at, won_at,
    created_at, notes
)
SELECT d.tenant_id,
       l.id,
       'DEMO-' || replace(d.month, '-', '') || '-' || lpad(d.seq::text, 3, '0'),
       'Demo order ' || d.i || ' — ' || split_part(d.email, '@', 1),
       'won',
       'INR',
       round(d.total_minor / 1.18)::bigint,
       d.total_minor - round(d.total_minor / 1.18)::bigint,
       d.total_minor,
       d.membership_id,
       (d.won_on - 6)  + time '11:00' AT TIME ZONE 'Asia/Kolkata',
       (d.won_on)      + time '11:00' AT TIME ZONE 'Asia/Kolkata',
       (d.won_on)      + time '11:00' AT TIME ZONE 'Asia/Kolkata',
       (d.won_on)      + time '11:30' AT TIME ZONE 'Asia/Kolkata',
       (d.won_on - 10) + time '10:00' AT TIME ZONE 'Asia/Kolkata',
       'Demo data for incentives (scripts/demo)'
FROM deal d
JOIN lead_pool l ON l.tenant_id = d.tenant_id AND l.n = ((d.seq - 1) % l.total) + 1;

COMMIT;
