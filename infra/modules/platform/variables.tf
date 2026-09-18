variable "project" {
  type    = string
  default = "intra-leads"
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "az_count" {
  type    = number
  default = 2
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "worker_cpu" {
  type    = number
  default = 256
}

variable "worker_memory" {
  type    = number
  default = 512
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "worker_desired_count" {
  type    = number
  default = 1
}

variable "db_name" {
  type    = string
  default = "intra_leads"
}

variable "db_username" {
  type    = string
  default = "intra"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_allocated_storage" {
  type    = number
  default = 50
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "certificate_arn" {
  type    = string
  default = ""
}

variable "github_org_repo" {
  type        = string
  default     = ""
  description = "GitHub org/repo for OIDC deploy role, e.g. acme/INTRACRM"
}

variable "github_oidc_provider_arn" {
  type        = string
  default     = ""
  description = "Existing GitHub OIDC provider ARN. Set this when the provider already exists in the account."
}
