# AWS Sample ECS App

This is a sample Terraform workspace used by the AutoOps AWS Deployment Foundation feature to demonstrate safe deployment to AWS ECS Fargate.

It creates:
- A VPC with 2 public subnets
- An ECS Cluster
- An ECR Repository
- A CloudWatch Log Group

This workspace is managed by the AutoOps worker and is subject to Operation Approval policies.
