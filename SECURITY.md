# Security Policy

AutoOps is a governance-first DevOps control-plane project.

Please do not open public issues or pull requests containing secrets, tokens, kubeconfig content, private keys, database URLs, Redis URLs, Authorization headers, provider credentials, screenshots with sensitive runtime data, or raw logs that may contain secrets.

## Reporting Security Issues

If you find a security issue, report it privately to the maintainer instead of posting sensitive details publicly.

Maintainer:
- GitHub: https://github.com/Pramu55
- LinkedIn: https://www.linkedin.com/in/pramod-s-s-268abb331

## Security Boundaries

AutoOps intentionally does not expose:

- Kubernetes exec/apply/delete/Secret listing
- Docker exec/delete shortcuts
- arbitrary Jenkins mutations
- raw provider payloads
- raw operation inputs
- token values
- kubeconfig content
- environment dumps
- Terraform state or backend config
- autonomous remediation

## Secret Handling

AutoOps uses environment-driven provider configuration. Real provider credentials must stay outside the repository.

Never commit:

- `.env`
- kubeconfig
- AWS keys
- Jenkins API tokens
- GitHub tokens
- database URLs with real passwords
- Redis URLs with real passwords
- private keys
- Terraform state
- provider logs containing secrets

Run the secret scanner before publishing changes:

- .\scripts\scan-secrets.ps1

## Demo Safety

AutoOps is local-first and company-demo ready, but it should not be connected to real company infrastructure without official authorization, credential review, network review, security review, and stakeholder approval.
