package autoops.operation

default allow = false
default approval_required = false

decision = {
  "allow": allow,
  "approvalRequired": approval_required,
  "risk": risk,
  "reasons": reasons,
  "controls": controls,
}

allow {
  count(deny_reasons) == 0
  supported_provider
}

approval_required {
  count(approval_reasons) > 0
}

risk = "critical" {
  count(deny_reasons) > 0
}

risk = "high" {
  count(deny_reasons) == 0
  approval_required
}

risk = "low" {
  count(deny_reasons) == 0
  not approval_required
}

reasons = output {
  count(deny_reasons) > 0
  output := sorted(deny_reasons)
}

reasons = output {
  count(deny_reasons) == 0
  count(approval_reasons) > 0
  output := sorted(approval_reasons)
}

reasons = ["Operation allowed by policy."] {
  count(deny_reasons) == 0
  count(approval_reasons) == 0
}

controls = output {
  output := sorted(control_set)
}

supported_provider {
  input.operation.provider == "JENKINS"
}

supported_provider {
  input.operation.provider == "KUBERNETES"
}

supported_provider {
  input.operation.provider == "DOCKER"
}

deny_reasons["Unsupported operation provider."] {
  not supported_provider
}

deny_reasons["Jenkins job is not allowlisted for AutoOps triggering."] {
  input.operation.provider == "JENKINS"
  not jenkins_job_allowlisted
}

deny_reasons[reason] {
  input.operation.provider == "KUBERNETES"
  namespace := input.target.namespace
  protected_namespace(namespace)
  reason := sprintf("Kubernetes namespace %q is protected.", [namespace])
}

approval_reasons[reason] {
  input.operation.provider == "KUBERNETES"
  input.target.action == "scale"
  input.target.replicas > input.policy.kubernetes.scaleApprovalThreshold
  reason := sprintf("Kubernetes scale target %v exceeds approval threshold %v.", [input.target.replicas, input.policy.kubernetes.scaleApprovalThreshold])
}

approval_reasons["Docker stop and restart operations require approval."] {
  input.operation.provider == "DOCKER"
  input.target.action == "stop"
}

approval_reasons["Docker stop and restart operations require approval."] {
  input.operation.provider == "DOCKER"
  input.target.action == "restart"
}

control_set["jenkins_allowed_jobs"] {
  input.operation.provider == "JENKINS"
}

control_set["kubernetes_protected_namespaces"] {
  input.operation.provider == "KUBERNETES"
}

control_set["kubernetes_scale_threshold"] {
  input.operation.provider == "KUBERNETES"
  input.target.action == "scale"
}

control_set["docker_destructive_action_approval"] {
  input.operation.provider == "DOCKER"
}

jenkins_job_allowlisted {
  input.target.jobName == input.policy.jenkins.allowedJobs[_]
}

protected_namespace(namespace) {
  namespace == input.policy.kubernetes.protectedNamespaces[_]
}

sorted(values) = output {
  output := sort([value | values[value]])
}
