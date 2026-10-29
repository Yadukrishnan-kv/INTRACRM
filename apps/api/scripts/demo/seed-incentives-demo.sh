#!/usr/bin/env bash
# Demo monthly sales targets + incentive plans, created through the API as the
# tenant admin, then computed, approved and paid. LOCAL DEV ONLY.
#
#   psql ... -f scripts/demo/incentives-demo-sales.sql   # won quotations first
#   scripts/demo/seed-incentives-demo.sh                 # then this
#
# Re-runnable: existing targets and plans are reused, and compute never
# touches payouts that are already approved or paid.
#
# All money is paise (₹ × 100), the unit the API uses for revenue and payouts.
set -euo pipefail

API=${API:-http://localhost:3000/api/v1}
EMAIL=${ADMIN_EMAIL:-admin@intraleads.local}
PASSWORD=${ADMIN_PASSWORD:-IntraLeads1!}
DEVICE=demo-seed-device

case "$API" in
  *localhost*|*127.0.0.1*|*10.0.2.2*|*192.168.*) ;;
  *) echo "Refusing to write demo data to $API (local only)." >&2; exit 1 ;;
esac

LOGIN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"deviceId\":\"$DEVICE\"}")
TOKEN=$(jq -r '.data.accessToken' <<<"$LOGIN")
TENANT=$(jq -r '.data.tenantId' <<<"$LOGIN")
H=(-H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $TENANT" -H "X-Device-Id: $DEVICE" -H 'Content-Type: application/json')
echo "Logged in as $EMAIL"

# The API rate-limits writes (40/min by default), so back off on 429 and retry.
call() {
  local out attempt
  for attempt in 1 2 3 4 5 6 7 8; do
    out=$(curl -s "$@" "${H[@]}")
    if ! jq -e '(.error.code? == "RATE_LIMITED") or (.error.status? == 429)' <<<"$out" >/dev/null 2>&1; then
      printf '%s' "$out"; return
    fi
    sleep 10
  done
  printf '%s' "$out"
}
get()  { call "$API$1"; }
post() { call -X POST "$API$1" -d "$2"; }

MEMBERS=$(get '/memberships?limit=100')
jq -e '.data | length > 0' <<<"$MEMBERS" >/dev/null || { echo "Could not list memberships: $MEMBERS" >&2; exit 1; }
member_id() { jq -r --arg e "$1" '.data[] | select(.user.email == $e) | .id' <<<"$MEMBERS"; }

# email : monthly revenue target in rupees
REPS=(
  ada.rao:1500000 leela.nair:1500000 kabir.khan:1200000
  dev.menon:1000000 priya.shah:1000000 meera.iyer:1000000 rohan.joshi:1000000
  arjun.patel:600000 sana.qureshi:600000 vikram.singh:600000
)
MONTHS=("2026-08-01 2026-08-31" "2026-09-01 2026-09-30" "2026-10-01 2026-10-31")
DEALS_TARGET=4   # won quotations per month for the deal-closer plan

# --- 1. Monthly sales targets --------------------------------------------------
EXISTING=$(get '/targets?limit=100')
has_target() {
  jq -e --arg s "$1" --arg m "$2" --arg p "$3" \
    '[.data[]? | select(.scopeId == $s and .metricCode == $m and .periodStart == $p and .periodType == "monthly")] | length > 0' \
    <<<"$EXISTING" >/dev/null
}

created=0
for rep in "${REPS[@]}"; do
  email="${rep%%:*}@intraleads.local"; rupees="${rep##*:}"
  mid=$(member_id "$email")
  [ -n "$mid" ] || { echo "  ! no membership for $email"; continue; }
  for span in "${MONTHS[@]}"; do
    read -r start end <<<"$span"
    for metric in revenue quotations_accepted; do
      value=$([ "$metric" = revenue ] && echo $((rupees * 100)) || echo $DEALS_TARGET)
      if has_target "$mid" "$metric" "$start"; then continue; fi
      res=$(post /targets "{\"periodType\":\"monthly\",\"scopeType\":\"membership\",\"scopeId\":\"$mid\",\"metricCode\":\"$metric\",\"targetValue\":$value,\"periodStart\":\"$start\",\"periodEnd\":\"$end\",\"notes\":\"Demo monthly target\"}")
      if jq -e '.data.id' <<<"$res" >/dev/null; then created=$((created + 1)); else echo "  ! target $email $metric $start: $(jq -c '.error // .' <<<"$res")"; fi
    done
  done
done
echo "Targets: $created created"

# --- 2. Incentive plans + slabs ------------------------------------------------
PLANS=$(get '/incentives/plans?limit=100')
ensure_plan() { # name, plan json, slab json...
  local name=$1 body=$2; shift 2
  local id
  id=$(jq -r --arg n "$name" '.data[]? | select(.name == $n) | .id' <<<"$PLANS" | head -1)
  if [ -n "$id" ]; then echo "$id"; return; fi
  local res
  res=$(post /incentives/plans "$body")
  id=$(jq -r '.data.id // empty' <<<"$res")
  [ -n "$id" ] || { echo "  ! plan $name failed: $(jq -c '.error // .' <<<"$res")" >&2; exit 1; }
  for slab in "$@"; do
    post "/incentives/plans/$id/slabs" "$slab" | jq -e '.data.id' >/dev/null \
      || echo "  ! slab failed on $name: $slab" >&2
  done
  echo "$id"
}

# Revenue: earn from 80 %, three bands, 10 % held back, capped at ₹75,000.
REVENUE_PLAN=$(ensure_plan "Monthly Revenue Incentive" '{
  "name": "Monthly Revenue Incentive",
  "description": "Percent of won revenue by attainment band. 10% held until quarter close.",
  "metricCode": "revenue", "periodType": "monthly", "scopeType": "membership",
  "basis": "revenue", "status": "active",
  "holdBps": 1000, "minAttainmentBps": 8000, "payoutCap": 7500000,
  "effectiveFrom": "2026-08-01"
}' \
  '{"label":"Qualifier 80–100%","fromBps":8000,"toBps":10000,"payoutKind":"percent","rateBps":150}' \
  '{"label":"Achiever 100–120%","fromBps":10000,"toBps":12000,"payoutKind":"percent","rateBps":250,"bonusAmount":500000}' \
  '{"label":"Star 120%+","fromBps":12000,"payoutKind":"percent","rateBps":350,"bonusAmount":1000000}')

# Deals: flat bonus for closing 4+ quotations, bigger at 6+.
DEALS_PLAN=$(ensure_plan "Deal Closer Bonus" '{
  "name": "Deal Closer Bonus",
  "description": "Flat bonus for won quotations against a monthly count of 4.",
  "metricCode": "quotations_accepted", "periodType": "monthly", "scopeType": "membership",
  "basis": "count", "status": "active",
  "holdBps": 0, "minAttainmentBps": 10000,
  "effectiveFrom": "2026-08-01"
}' \
  '{"label":"4–5 deals","fromBps":10000,"toBps":15000,"payoutKind":"flat","amount":300000}' \
  '{"label":"6+ deals","fromBps":15000,"payoutKind":"flat","amount":600000}')

echo "Plans: revenue=$REVENUE_PLAN deals=$DEALS_PLAN"

# --- 3. Compute every month for both plans -----------------------------------
for plan in "$REVENUE_PLAN" "$DEALS_PLAN"; do
  for span in "${MONTHS[@]}"; do
    read -r start end <<<"$span"
    post /incentives/compute "{\"planId\":\"$plan\",\"periodStart\":\"$start\",\"periodEnd\":\"$end\"}" \
      | jq -r --arg s "$start" '"  compute \(.data.periodLabel // $s): \(.data.computed // "?") computed, \(.data.skipped // "?") locked\(if .error then " ERROR " + (.error|tostring) else "" end)"'
  done
done

# --- 4. Approve + pay -----------------------------------------------------------
# August: approved and paid. September: approved, awaiting payment.
# October: left as draft (month still running).
decide() { # periodStart, action
  local ids
  ids=$(get "/reports/incentives?from=$1&to=$1" \
    | jq -r --arg p "$1" --arg want "$([ "$2" = pay ] && echo approved || echo draft)" \
      '.data.items[] | select(.periodStart == $p and .status == $want and .earnedAmount > 0) | .id')
  local n=0
  for id in $ids; do
    post "/incentives/payouts/$id/$2" "{\"notes\":\"Demo $2\"}" | jq -e '.data.id' >/dev/null && n=$((n + 1))
  done
  echo "  $2 $1: $n payouts"
}
decide 2026-08-01 approve
decide 2026-08-01 pay
decide 2026-09-01 approve

# --- 5. Summary ----------------------------------------------------------------
get /reports/incentives | jq -r '
  "\nTotals (₹): earned \(.data.totals.earnedAmount/100) · payable \(.data.totals.payableAmount/100) · on hold \(.data.totals.holdAmount/100) · paid \(.data.totals.paidAmount/100)",
  "By status: \(.data.byStatus | map("\(.status)=\(.count)") | join(", "))"'
