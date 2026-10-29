#!/usr/bin/env bash
set -euo pipefail

# Registers a new ECS task definition revision with IMAGE, runs the migrate
# family against RDS, then force-deploys api and worker services.
#
# Required env:
#   IMAGE                  ECR URI including tag
#   ECS_CLUSTER
#   ECS_API_FAMILY         e.g. intra-leads-staging-api
#   ECS_WORKER_FAMILY
#   ECS_MIGRATE_FAMILY
#   ECS_API_SERVICE
#   ECS_WORKER_SERVICE
#   ECS_SUBNETS            comma-separated private subnet ids
#   ECS_SECURITY_GROUP

: "${IMAGE:?}"
: "${ECS_CLUSTER:?}"
: "${ECS_API_FAMILY:?}"
: "${ECS_WORKER_FAMILY:?}"
: "${ECS_MIGRATE_FAMILY:?}"
: "${ECS_API_SERVICE:?}"
: "${ECS_WORKER_SERVICE:?}"
: "${ECS_SUBNETS:?}"
: "${ECS_SECURITY_GROUP:?}"

register_image() {
  local family="$1"
  local tmp
  tmp="$(mktemp)"
  aws ecs describe-task-definition --task-definition "$family" \
    --query 'taskDefinition' --output json \
    | jq --arg IMAGE "$IMAGE" '
        .containerDefinitions[0].image = $IMAGE
        | del(
            .taskDefinitionArn,
            .revision,
            .status,
            .requiresAttributes,
            .compatibilities,
            .registeredAt,
            .registeredBy,
            .deregisteredAt
          )
      ' > "$tmp"
  aws ecs register-task-definition --cli-input-json "file://$tmp" >/dev/null
  rm -f "$tmp"
  echo "Registered $family with $IMAGE"
}

register_image "$ECS_MIGRATE_FAMILY"
register_image "$ECS_API_FAMILY"
register_image "$ECS_WORKER_FAMILY"

subnet_csv="$(printf '%s' "$ECS_SUBNETS" | tr -d '[:space:]')"
run_json="$(mktemp)"
aws ecs run-task \
  --cluster "$ECS_CLUSTER" \
  --task-definition "$ECS_MIGRATE_FAMILY" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${subnet_csv}],securityGroups=[${ECS_SECURITY_GROUP}],assignPublicIp=DISABLED}" \
  --output json > "$run_json"

task_arn="$(jq -r '.tasks[0].taskArn // empty' "$run_json")"
if [[ -z "$task_arn" || "$task_arn" == "null" ]]; then
  echo "Failed to start migrate task" >&2
  jq '.failures' "$run_json" >&2
  rm -f "$run_json"
  exit 1
fi
rm -f "$run_json"

echo "Migrate task $task_arn"
aws ecs wait tasks-stopped --cluster "$ECS_CLUSTER" --tasks "$task_arn"

exit_code="$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$task_arn" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
if [[ "$exit_code" != "0" ]]; then
  echo "Schema apply failed with exit code $exit_code" >&2
  aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$task_arn" --output json >&2
  exit 1
fi

aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_API_SERVICE" \
  --task-definition "$ECS_API_FAMILY" --force-new-deployment >/dev/null
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_WORKER_SERVICE" \
  --task-definition "$ECS_WORKER_FAMILY" --force-new-deployment >/dev/null

echo "Deployed $ECS_API_SERVICE and $ECS_WORKER_SERVICE"
