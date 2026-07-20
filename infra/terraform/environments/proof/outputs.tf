output "instance_id" {
  description = "Disposable EC2 proof instance identifier."
  value       = aws_instance.proof.id
  sensitive   = false
}

output "public_ipv4" {
  description = "Temporary auto-assigned public IPv4 for approved DNS A record use."
  value       = aws_instance.proof.public_ip
  sensitive   = false
}

output "public_url" {
  description = "Approved public HTTPS URL for the disposable proof."
  value       = "https://${var.approved_domain}"
  sensitive   = false
}

output "ssm_target_id" {
  description = "SSM Session Manager target identifier for the proof host."
  value       = aws_instance.proof.id
  sensitive   = false
}

output "proof_expires_at" {
  description = "Approved proof teardown timestamp."
  value       = var.proof_expires_at
  sensitive   = false
}

output "estimated_hourly_cost_usd" {
  description = "Documented approximate hourly direct infrastructure estimate for the t3.large proof."
  value       = 0.0996
  sensitive   = false
}

output "security_group_id" {
  description = "Security group attached to the disposable EC2 proof instance."
  value       = aws_security_group.proof_instance.id
  sensitive   = false
}
