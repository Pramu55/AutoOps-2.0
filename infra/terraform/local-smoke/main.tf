terraform {
  required_version = ">= 1.4.0"
}

resource "terraform_data" "local_smoke" {
  input = {
    message = var.message
    owner   = "autoops-local-demo"
  }
}
