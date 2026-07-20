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

variable "proof_expires_at" {
  description = "Approved proof teardown timestamp in RFC3339 UTC form."
  type        = string

  validation {
    condition     = can(regex("^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.proof_expires_at))
    error_message = "proof_expires_at must be an approved RFC3339 UTC timestamp such as 2026-07-20T18:00:00Z."
  }
}

variable "approved_domain" {
  description = "Approved user-owned domain or subdomain for the disposable HTTPS proof."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$", var.approved_domain))
    error_message = "approved_domain must be a non-secret approved DNS name with at least one dot."
  }
}

variable "approved_ingress_cidr" {
  description = "Explicitly approved tester IPv4 /32 CIDR allowed to reach TCP 443."
  type        = string

  validation {
    condition     = can(regex("^(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})(\\.(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})){3}/32$", var.approved_ingress_cidr))
    error_message = "approved_ingress_cidr must be a single approved IPv4 /32 CIDR."
  }
}

variable "ami_id" {
  description = "Explicitly approved Ubuntu Server 24.04 LTS x86_64 AMI ID in ap-south-1."
  type        = string

  validation {
    condition     = can(regex("^ami-[0-9a-f]{8,17}$", var.ami_id))
    error_message = "ami_id must be an explicit approved AMI ID such as ami-0123456789abcdef0."
  }
}

variable "cost_approval_reference" {
  description = "Non-secret reference proving the disposable proof cost boundary was approved."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_.:/=+@ -]{0,126}$", var.cost_approval_reference))
    error_message = "cost_approval_reference must be a non-empty non-secret approval label using safe tag characters."
  }
}

variable "max_proof_hours" {
  description = "Maximum approved proof runtime in hours."
  type        = number
  default     = 8

  validation {
    condition     = var.max_proof_hours >= 1 && var.max_proof_hours <= 8
    error_message = "max_proof_hours must be between 1 and 8."
  }
}

variable "instance_type" {
  description = "Approved proof EC2 instance type."
  type        = string
  default     = "t3.large"

  validation {
    condition     = var.instance_type == "t3.large"
    error_message = "instance_type must equal t3.large for the approved proof design."
  }
}

variable "root_volume_size_gib" {
  description = "Encrypted gp3 root volume size in GiB."
  type        = number
  default     = 40

  validation {
    condition     = var.root_volume_size_gib == 40
    error_message = "root_volume_size_gib must equal 40 for the approved proof design."
  }
}

variable "enable_public_https" {
  description = "Guardrail requiring public HTTPS on TCP 443 for the approved tester /32."
  type        = bool
  default     = true

  validation {
    condition     = var.enable_public_https == true
    error_message = "enable_public_https must remain true for this proof."
  }
}

variable "associate_public_ip" {
  description = "Guardrail requiring an auto-assigned public IPv4 because no NAT Gateway or endpoints exist."
  type        = bool
  default     = true

  validation {
    condition     = var.associate_public_ip == true
    error_message = "associate_public_ip must remain true for this proof."
  }
}

variable "enable_ssm" {
  description = "Guardrail requiring SSM-only administration."
  type        = bool
  default     = true

  validation {
    condition     = var.enable_ssm == true
    error_message = "enable_ssm must remain true for this proof."
  }
}

variable "detailed_monitoring" {
  description = "Guardrail disabling paid detailed monitoring for the disposable proof."
  type        = bool
  default     = false

  validation {
    condition     = var.detailed_monitoring == false
    error_message = "detailed_monitoring must remain false for this proof."
  }
}

variable "expected_max_cost_usd" {
  description = "Maximum approved direct infrastructure cost for one proof run."
  type        = number
  default     = 2

  validation {
    condition     = var.expected_max_cost_usd <= 2
    error_message = "expected_max_cost_usd must not exceed USD 2."
  }
}
