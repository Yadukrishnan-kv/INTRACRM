#!/bin/sh
set -eu

# Applies INTRA LEADS SQL in the documented order.
# Usage: apply-sql   (uses DATABASE_URL)
#        apply-sql postgresql://user:pass@host:5432/intra_leads

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SQL_DIR="${SQL_DIR:-$ROOT/docs/data/sql}"
if [ -d /opt/intra-leads/sql ]; then
  SQL_DIR=/opt/intra-leads/sql
fi

URL="${1:-${DATABASE_URL:-}}"
if [ -z "$URL" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi
URL="${URL%%\?*}"
export PGSSLMODE="${PGSSLMODE:-prefer}"

FILES="
intra_leads_schema.sql
intra_leads_partitions.sql
intra_leads_auth_login_history.sql
intra_leads_lead_management.sql
intra_leads_lead_pipeline.sql
intra_leads_activity_timeline.sql
intra_leads_follow_ups.sql
intra_leads_follow_up_engine.sql
intra_leads_site_visits.sql
intra_leads_quotations.sql
intra_leads_catalog.sql
intra_leads_comms.sql
intra_leads_billing.sql
intra_leads_quotation_follow_up.sql
intra_leads_targets.sql
intra_leads_incentives.sql
intra_leads_staff_performance.sql
intra_leads_warranty.sql
intra_leads_seed_rbac.sql
intra_leads_rbac_product_roles.sql
"

echo "Applying INTRA LEADS schema from $SQL_DIR"
for file in $FILES; do
  path="$SQL_DIR/$file"
  if [ ! -f "$path" ]; then
    echo "Missing $path" >&2
    exit 1
  fi
  echo "-> $file"
  psql -v ON_ERROR_STOP=1 "$URL" -f "$path"
done

echo "Schema apply complete"
