output "smoke_message" {
  description = "Safe local smoke output."
  value       = terraform_data.local_smoke.output.message
}
