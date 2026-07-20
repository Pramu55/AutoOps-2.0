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
    Slice              = "2"
  }
}
