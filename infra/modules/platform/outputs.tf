output "vpc_id" {
  value = aws_vpc.this.id
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_api_service_name" {
  value = aws_ecs_service.api.name
}

output "ecs_worker_service_name" {
  value = aws_ecs_service.worker.name
}

output "migrate_task_definition" {
  value = aws_ecs_task_definition.migrate.family
}

output "private_subnet_ids" {
  value = local.private_subnet_ids
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}

output "secrets_arn" {
  value = aws_secretsmanager_secret.app.arn
}

output "files_bucket" {
  value = aws_s3_bucket.files.bucket
}

output "github_deploy_role_arn" {
  value = try(aws_iam_role.github_deploy[0].arn, "")
}

output "github_oidc_provider_arn" {
  value = local.github_oidc_arn
}

output "ecr_repository_name" {
  value = aws_ecr_repository.api.name
}
