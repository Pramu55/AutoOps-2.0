# AutoOps Local Terraform/OpenTofu Smoke Workspace

This workspace is intentionally local-only and credential-free.

It uses the built-in `terraform_data` resource so AutoOps can demonstrate validate, plan, and approval-gated apply without creating cloud resources or requiring AWS credentials.

Do not commit `.terraform/`, `*.tfstate`, cloud credentials, or generated provider caches.
