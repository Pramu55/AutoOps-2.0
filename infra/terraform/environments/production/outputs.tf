output "name_prefix" {
  description = "Deterministic name prefix for the production environment."
  value       = local.name_prefix
  sensitive   = false
}

output "standard_tags" {
  description = "Standard non-sensitive tags for the production environment."
  value       = local.standard_tags
  sensitive   = false
}

output "selected_region" {
  description = "Validated AWS region selected for the production environment."
  value       = var.aws_region
  sensitive   = false
}

output "selected_environment" {
  description = "Validated environment name for this root module."
  value       = var.environment
  sensitive   = false
}
