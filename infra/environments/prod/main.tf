terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
  # backend "s3" {
  #   bucket = "intra-leads-tfstate"
  #   key    = "prod/terraform.tfstate"
  #   region = "ap-south-1"
  # }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "intra-leads"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "github_org_repo" {
  type    = string
  default = ""
}

variable "github_oidc_provider_arn" {
  type    = string
  default = ""
}

variable "certificate_arn" {
  type    = string
  default = ""
}

module "platform" {
  source                   = "../../modules/platform"
  project                  = "intra-leads"
  environment              = "prod"
  aws_region               = var.aws_region
  image_tag                = var.image_tag
  github_org_repo          = var.github_org_repo
  github_oidc_provider_arn = var.github_oidc_provider_arn
  certificate_arn          = var.certificate_arn
  api_cpu                  = 1024
  api_memory               = 2048
  api_desired_count        = 2
  worker_desired_count     = 2
  db_instance_class        = "db.t4g.large"
  db_allocated_storage     = 100
  redis_node_type          = "cache.t4g.small"
}

output "alb_dns_name" {
  value = module.platform.alb_dns_name
}

output "ecr_repository_url" {
  value = module.platform.ecr_repository_url
}

output "ecr_repository_name" {
  value = module.platform.ecr_repository_name
}

output "ecs_cluster_name" {
  value = module.platform.ecs_cluster_name
}

output "ecs_api_service_name" {
  value = module.platform.ecs_api_service_name
}

output "ecs_worker_service_name" {
  value = module.platform.ecs_worker_service_name
}

output "migrate_task_definition" {
  value = module.platform.migrate_task_definition
}

output "private_subnet_ids" {
  value = module.platform.private_subnet_ids
}

output "ecs_security_group_id" {
  value = module.platform.ecs_security_group_id
}

output "github_deploy_role_arn" {
  value = module.platform.github_deploy_role_arn
}

output "github_oidc_provider_arn" {
  value = module.platform.github_oidc_provider_arn
}

output "files_bucket" {
  value = module.platform.files_bucket
}

output "secrets_arn" {
  value = module.platform.secrets_arn
}
