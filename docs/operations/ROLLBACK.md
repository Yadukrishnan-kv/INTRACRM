# Rollback Plan

Rollback restores a **previous ECS task definition / image**. It does not undo expand-only SQL. If a release mixed a breaking schema change with an app change, **do not roll the image back** onto a newer schema without a forward fix.

Owner: deployer on-call  
Decision: Sev-1 user-facing outage, data risk, or smoke failure that cannot be hotfixed in < 15 minutes.

## What rolls back

| Component | Rollback method | Data impact |
| --- | --- | --- |
| API + worker image | Previous ECS task definition revision | None |
| ALB / Terraform | `terraform apply` of last known good (rare) | None if no destroy |
| RDS schema | **Not rolled back.** Ship a forward SQL fix |
| Redis | Treat as disposable; flush only if corrupt cache/queue and jobs can be rebuilt |
| S3 files | Restore a prior object version if a release corrupted objects |
| Flutter | Store phased-release halt / previous store build; API must stay compatible |

SQL in `docs/data/sql` is applied in order and is designed to be **expand-only**. Dropping columns or renaming enums is not a rollback; it is a new change window.

## Decision tree

1. **Health live fails** on new tasks, old tasks still healthy → ECS circuit: stop the new deployment (see below).
2. **Ready fails** (Postgres/Redis) → not an app rollback; check RDS/Redis/SGs/secrets.
3. **5xx / p95 / error burst** after a green ready → roll API+worker images together (same SHA).
4. **Bad SQL already applied** → keep the new image (or a hotfix image) that understands the new schema; do not revert the image.
5. **Poison job** → pause worker (`desiredCount=0` or stop the service), fix/delete the job, resume. Do not roll API unless the producer is also bad.

## Procedure (ECS image)

You need the previous task definition revision (record it on the deploy checklist).

```bash
export AWS_REGION=ap-south-1
export CLUSTER=intra-leads-prod
export API_SERVICE=intra-leads-prod-api
export WORKER_SERVICE=intra-leads-prod-worker

# Inspect current vs previous
aws ecs describe-services --cluster "$CLUSTER" --services "$API_SERVICE" \
  --query 'services[0].{td:taskDefinition,events:events[0:5]}'

# Roll both services to the last good family:revision (example)
aws ecs update-service --cluster "$CLUSTER" --service "$API_SERVICE" \
  --task-definition intra-leads-prod-api:<PREV> --force-new-deployment
aws ecs update-service --cluster "$CLUSTER" --service "$WORKER_SERVICE" \
  --task-definition intra-leads-prod-worker:<PREV> --force-new-deployment

aws ecs wait services-stable --cluster "$CLUSTER" --services "$API_SERVICE" "$WORKER_SERVICE"
```

GitHub Actions CD does not auto-rollback. Re-running CD on an older tag (`v*` or `workflow_dispatch`) will **re-run migrate** (idempotent expand-only SQL is OK) and then deploy that image. Prefer explicit task-definition rollback when you must avoid a migrate cycle.

## After rollback

- [ ] `GET /api/v1/health/live` and `/ready` on the public hostname
- [ ] Login, list leads, assign, sync smoke
- [ ] Worker logs: no crash loop; delayed jobs resume
- [ ] Announce in the incident channel: version rolled, SHA, time
- [ ] File the incident: trigger, blast radius, whether data was written with the bad build
- [ ] Block a new prod tag until a forward fix or a confirmed false alarm

## Abort a deploy in flight

If migrate **failed**, CD already stopped before updating services. No rollback needed; the previous tasks keep serving.

If migrate **succeeded** and services are draining to the new revision:

```bash
# Optional: pin desired count while you decide
aws ecs update-service --cluster "$CLUSTER" --service "$API_SERVICE" --desired-count 2
```

Then point `--task-definition` at the previous revision as above. ALB health checks (`/api/v1/health/live`, unhealthy threshold 3 × 30 s) will drop bad targets.

## Communication

| Audience | When |
| --- | --- |
| On-call + deployer | Immediately |
| Pilot tenant admins | If user-facing for > 15 minutes |
| Exec sponsors | Sev-1 or data repair |

Do not restore RDS to roll back an application bug unless [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) criteria are met (data corruption / regional loss). Point-in-time restore **discards** writes after the restore time.
