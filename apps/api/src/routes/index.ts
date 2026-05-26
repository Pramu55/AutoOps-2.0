import { Router } from 'express';
import { auditLogRouter } from '../modules/audit-logs/audit-log.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { deploymentRouter } from '../modules/deployments/deployment.routes.js';
import { incidentRouter } from '../modules/incidents/incident.routes.js';
import { awsRouter } from '../modules/integrations/aws/aws.routes.js';
import { cloudReadinessRouter } from '../modules/integrations/cloud/cloud-readiness.routes.js';
import { devOpsToolsRouter } from '../modules/integrations/devops-tools/devops-tools.routes.js';
import { dockerRouter } from '../modules/integrations/docker/docker.routes.js';
import { githubActionsRouter } from '../modules/integrations/github-actions/github-actions.routes.js';
import { infrastructureRouter } from '../modules/integrations/infrastructure/infrastructure.routes.js';
import { jenkinsRouter } from '../modules/integrations/jenkins/jenkins.routes.js';
import { kubernetesRouter } from '../modules/integrations/kubernetes/kubernetes.routes.js';
import { observabilityIntegrationRouter } from '../modules/integrations/observability/observability-integration.routes.js';
import { providerRegistryRouter } from '../modules/integrations/providers/provider-registry.routes.js';
import { opsRouter } from '../modules/ops/ops.routes.js';
import { operationRouter } from '../modules/operations/operation.routes.js';
import { projectRouter } from '../modules/projects/project.routes.js';
import { resourceGraphRouter } from '../modules/resources/resource-graph.routes.js';
import { signalRouter } from '../modules/signals/signal.routes.js';
import { systemRouter } from '../modules/system/system.routes.js';


/**
 * Versioned API mount point. Mount Phase 2+ modules here as they land:
 *   v1.use('/projects', projectRouter);
 *   v1.use('/deployments', deploymentRouter);
 *   v1.use('/pipelines', pipelineRouter);
 */
export const v1Router: Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/projects', projectRouter);
v1Router.use('/resources', resourceGraphRouter);
v1Router.use('/signals', signalRouter);
v1Router.use('/deployments', deploymentRouter);

v1Router.use('/incidents', incidentRouter);
v1Router.use('/operations', operationRouter);
v1Router.use('/audit-logs', auditLogRouter);
v1Router.use('/integrations/providers', providerRegistryRouter);
v1Router.use('/integrations/kubernetes', kubernetesRouter);
v1Router.use('/integrations/aws', awsRouter);
v1Router.use('/integrations/cloud', cloudReadinessRouter);
v1Router.use('/integrations/devops-tools', devOpsToolsRouter);
v1Router.use('/integrations/github-actions', githubActionsRouter);
v1Router.use('/integrations/jenkins', jenkinsRouter);
v1Router.use('/integrations/docker', dockerRouter);
v1Router.use('/integrations/infrastructure', infrastructureRouter);
v1Router.use('/integrations/observability', observabilityIntegrationRouter);
v1Router.use('/ops', opsRouter);
v1Router.use('/system', systemRouter);
