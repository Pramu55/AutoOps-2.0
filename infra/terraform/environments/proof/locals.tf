locals {
  name_prefix = "${var.project_name}-${var.environment}"

  standard_tags = {
    Project            = var.project_name
    Environment        = var.environment
    ManagedBy          = var.managed_by
    Owner              = var.owner
    CostCenter         = var.cost_center
    DataClassification = var.data_classification
    Repository         = "Pramu55/AutoOps-2.0"
    Gate               = "3"
    Slice              = "5A"
  }

  proof_tags = merge(local.standard_tags, {
    ApprovedDomain        = var.approved_domain
    CostApprovalReference = var.cost_approval_reference
    ProofExpiresAt        = var.proof_expires_at
    MaxProofHours         = tostring(var.max_proof_hours)
  })
}
