# AutoOps Local Ansible Smoke Playbook

This Ansible sample is intentionally safe:

- localhost only
- local connection only
- no sudo
- no package installation
- no service restarts
- no SSH keys
- no vault secrets

AutoOps can run syntax-check, check mode, and approval-gated run operations against this allowlisted playbook when `ansible-playbook` is installed in the worker runtime.
