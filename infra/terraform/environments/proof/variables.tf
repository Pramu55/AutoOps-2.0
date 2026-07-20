variable "project_name" {
  description = "Lowercase project slug used for deterministic names."
  type        = string
  default     = "autoops"

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$", var.project_name))
    error_message = "project_name must be lowercase, start with a letter or number, contain only lowercase letters, numbers, and hyphens, not end with a hyphen, and be at most 40 characters."
  }
}

variable "environment" {
  description = "Gate 3 proof environment name."
  type        = string
  default     = "proof"

  validation {
    condition     = var.environment == "proof"
    error_message = "environment must equal proof for this root module."
  }
}

variable "aws_region" {
  description = "Approved AWS region for Gate 3 architecture."
  type        = string
  default     = "ap-south-1"

  validation {
    condition     = var.aws_region == "ap-south-1"
    error_message = "aws_region must equal ap-south-1 for the current Gate 3 architecture."
  }
}

variable "owner" {
  description = "Non-secret owner label for standard tags."
  type        = string
  default     = "platform-engineering"

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_.:/=+@ -]{0,62}$", var.owner))
    error_message = "owner must be a non-empty non-secret label using safe tag characters."
  }
}

variable "cost_center" {
  description = "Non-secret cost-center label for standard tags."
  type        = string
  default     = "portfolio"

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_.:/=+@ -]{0,62}$", var.cost_center))
    error_message = "cost_center must be a non-empty non-secret label using safe tag characters."
  }
}

variable "managed_by" {
  description = "Tool ownership label for standard tags."
  type        = string
  default     = "terraform"

  validation {
    condition     = var.managed_by == "terraform"
    error_message = "managed_by must equal terraform."
  }
}

variable "data_classification" {
  description = "Proof data classification label."
  type        = string
  default     = "disposable"

  validation {
    condition     = contains(["disposable", "internal"], var.data_classification)
    error_message = "data_classification must be disposable or internal for proof."
  }
}
