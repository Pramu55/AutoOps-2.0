## Summary

Describe the change and why it is needed.

## Release Gate Checklist

- [ ] Typecheck/build passed
- [ ] Release check passed
- [ ] Secret scan passed
- [ ] No `.env` committed
- [ ] No tokens or secrets committed
- [ ] No RBAC weakening
- [ ] No approval bypass
- [ ] No unsafe Docker/Kubernetes/Jenkins action added
- [ ] Prisma migration included if schema changed
- [ ] Docs updated if behavior changed
- [ ] Screenshots included for UI changes
