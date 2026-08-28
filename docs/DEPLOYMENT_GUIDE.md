# Deployment Engineering Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Deployment Strategies](#deployment-strategies)
6. [Environment Management](#environment-management)
7. [Security](#security)
8. [Monitoring & Observability](#monitoring--observability)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This guide covers the complete deployment engineering approach for the Prompt Builder application, including:

- Automated CI/CD pipelines
- Zero-downtime deployments
- Progressive delivery strategies
- Multi-environment management
- Security best practices
- Monitoring and observability

## Architecture

### Deployment Pipeline Flow

```
┌─────────────┐
│   Git Push  │
└──────┬──────┘
       │
       ├─────────────────────────────────────────┐
       │                                         │
┌──────▼──────┐                          ┌──────▼──────┐
│  Unit Tests │                          │    Lint     │
│  Coverage   │                          │   Format    │
└──────┬──────┘                          └──────┬──────┘
       │                                         │
       ├─────────────────────────────────────────┤
       │                                         │
┌──────▼──────┐                          ┌──────▼──────┐
│   Build     │                          │  Security   │
│  Frontend   │                          │   Scanning  │
└──────┬──────┘                          └──────┬──────┘
       │                                         │
       ├─────────────────────────────────────────┤
       │
┌──────▼──────────────┐
│  Build & Push Docker│
│  Image with SBOM    │
│  & Signing          │
└──────┬──────────────┘
       │
┌──────▼──────────┐
│  Deploy Staging │
│  (Automatic)    │
└──────┬──────────┘
       │
┌──────▼──────────────┐
│  E2E Tests         │
│  Performance Tests │
└──────┬──────────────┘
       │
┌──────▼──────────────┐
│  Deploy Production │
│  (Manual Approval)  │
│  Blue-Green with    │
│  Canary Analysis    │
└─────────────────────┘
```

## Prerequisites

### Required Tools

- Docker (20.10+)
- kubectl (1.25+)
- kustomize (4.5+)
- helm (3.10+)
- argocd CLI (2.8+)
- k6 (for load testing)

### Required Accounts/Services

- GitHub account with Actions enabled
- Container registry (GitHub Container Registry)
- Kubernetes cluster (EKS, GKE, or AKS)
- Cloud provider account (AWS/GCP/Azure)
- Monitoring service (Prometheus/Grafana)

### GitHub Secrets Configuration

Configure these secrets in GitHub repository settings:

```bash
# Required secrets
VITE_ANTHROPIC_API_KEY          # Anthropic API key
VITE_FIREBASE_API_KEY           # Firebase configuration
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID

# Deployment secrets
AWS_ACCESS_KEY_ID               # AWS credentials
AWS_SECRET_ACCESS_KEY
AWS_REGION

# Security scanning
SNYK_TOKEN                      # Snyk security scanning
FOSSA_API_KEY                   # License compliance

# Monitoring
DATADOG_API_KEY                 # Monitoring (optional)
DATADOG_APP_KEY

# Notifications
SLACK_WEBHOOK                   # Slack notifications
```

## CI/CD Pipeline

### Workflows

#### 1. Test Pipeline (`test.yml`)

Runs on every push and PR:

- Unit tests with coverage
- Linting (ESLint)
- Code formatting check (Prettier)
- Frontend build
- Coverage reporting to Codecov

#### 2. Security Scanning

`security-scan.yml` was deleted 2026-08-27 (pre-launch, zero users, and its
FOSSA/Snyk secrets were never set — every run failed). Recover it from git
history as part of launch preparation; `npm audit` covers dependency
advisories in the meantime.

#### 3. Build & Push (`build-and-push.yml`)

Runs on main branch push:

- Multi-platform Docker build (amd64, arm64)
- Image signing with Cosign
- SBOM generation
- Push to GitHub Container Registry

#### 4. E2E Testing (`e2e.yml`)

Runs on push/PR:

- Playwright E2E tests
- Visual regression tests
- Accessibility tests (Pa11y, Lighthouse)

#### 5. Performance Testing (`performance.yml`)

Runs on main push and daily schedule:

- k6 load testing
- Bundle size analysis
- Lighthouse performance audit
- Memory profiling

#### 6. Deployment (`deploy.yml`)

Runs on main push and tags:

- Deploy to staging (automatic)
- Deploy to production (manual approval)
- Blue-green deployment with traffic shifting
- Health checks and smoke tests
- Automated rollback on failure

### Triggering Deployments

#### Staging Deployment

```bash
# Automatic on main branch push
git push origin main
```

#### Production Deployment

```bash
# Create and push a version tag
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3

# Or use workflow dispatch
gh workflow run deploy.yml -f environment=production
```

## Deployment Strategies

### 1. Staging: Rolling Update

- Automatic deployment on main branch
- Rolling update strategy
- 2 replicas minimum
- Health checks before traffic routing

### 2. Production: Blue-Green with Canary

#### Phase 1: Blue-Green Setup

```
Blue (Current)         Green (New)
    100% traffic  →      0% traffic
```

#### Phase 2: Canary Testing

```
Blue                    Green
    90% traffic  →      10% traffic (5 minutes)
    50% traffic  →      50% traffic (5 minutes)
    20% traffic  →      80% traffic (5 minutes)
     0% traffic  →     100% traffic
```

#### Phase 3: Analysis

At each canary step:

- Success rate >= 95%
- P95 latency <= 1000ms
- P99 latency <= 2000ms
- Error rate <= 5%
- Memory usage <= 90%

Auto-rollback if any metric fails.

### 3. Progressive Delivery with Argo Rollouts

For Kubernetes deployments:

```bash
# Deploy canary
kubectl apply -f k8s/rollouts/canary-rollout.yaml

# Monitor rollout
kubectl argo rollouts get rollout prompt-builder-api --watch

# Promote if healthy
kubectl argo rollouts promote prompt-builder-api

# Abort if issues
kubectl argo rollouts abort prompt-builder-api
```

## Environment Management

### Environment Structure

```
├── Development (local)
│   ├── docker-compose.yml
│   └── .env
├── Staging (auto-deploy)
│   ├── k8s/overlays/staging/
│   └── Namespace: staging
└── Production (manual approval)
    ├── k8s/overlays/production/
    └── Namespace: production
```

### Configuration Hierarchy

1. **Base Configuration** (`k8s/base/`)
   - Common resources
   - Default values

2. **Environment Overlays** (`k8s/overlays/{env}/`)
   - Environment-specific patches
   - Resource limits
   - Replica counts

3. **Secrets**
   - External Secrets Operator (recommended)
   - Kubernetes Secrets
   - Cloud provider secrets manager

### Deploying to Kubernetes

#### Using kubectl + Kustomize

```bash
# Staging
kubectl apply -k k8s/overlays/staging

# Production
kubectl apply -k k8s/overlays/production
```

#### Using ArgoCD (GitOps)

```bash
# Install ArgoCD applications
kubectl apply -f argocd/application-staging.yaml
kubectl apply -f argocd/application-production.yaml

# Sync manually
argocd app sync prompt-builder-staging
argocd app sync prompt-builder-production --manual

# View status
argocd app get prompt-builder-production
```

## Security

### Image Signing Verification

```bash
# Verify image signature
cosign verify \
  --certificate-identity-regexp="https://github.com/bharm16/prompt-builder/*" \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  ghcr.io/bharm16/prompt-builder:latest
```

### SBOM Generation

```bash
# View SBOM
cosign download sbom ghcr.io/bharm16/prompt-builder:latest
```

### Secrets Management

#### Option 1: External Secrets Operator

```yaml
# Create SecretStore
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
```

#### Option 2: Sealed Secrets

```bash
# Seal a secret
kubectl create secret generic my-secret --dry-run=client -o yaml | \
  kubeseal -o yaml > sealed-secret.yaml
```

### Network Policies

```bash
# Apply network policies
kubectl apply -f k8s/security/network-policies.yaml
```

## Monitoring & Observability

### Metrics

**Application Telemetry** (PostHog events — see [observability.md](architecture/observability.md)):

- `optimize.completed` — T2V optimize success/failure with stage timings
- `suggestions.completed` — enhancement-suggestion lifecycle per request
- `llm.call.completed` — every provider call routed through aiService

**Infrastructure Metrics** (via Prometheus):

- Pod CPU/Memory usage
- Network I/O
- Disk usage
- Container restarts

### Logs

**Structured Logging** (Pino):

```json
{
  "level": "info",
  "time": 1699999999999,
  "pid": 1,
  "hostname": "pod-123",
  "requestId": "req-abc-123",
  "msg": "Request completed",
  "duration": 234
}
```

**Log Aggregation**:

- Stdout/stderr → Fluentd/Fluent Bit → Elasticsearch/CloudWatch
- Query via Kibana/CloudWatch Insights

### Alerts

Critical alerts configured in Prometheus:

- API down (2+ minutes)
- High error rate (>5%)
- High latency (P95 >1s)
- Memory usage (>90%)
- Pod restarting frequently

### Dashboards

**Grafana Dashboards**:

1. Application Overview
   - Request rate
   - Success rate
   - Latency percentiles

2. Infrastructure Health
   - Pod status
   - Resource usage
   - Node health

3. Business Metrics
   - API calls per minute
   - Optimization requests
   - Cache performance

### Accessing Monitoring

```bash
# Port forward Prometheus
kubectl port-forward -n monitoring svc/prometheus 9090:9090

# Port forward Grafana
kubectl port-forward -n monitoring svc/grafana 3000:3000

# Access dashboards
open http://localhost:3000  # Grafana (admin/admin)
open http://localhost:9090  # Prometheus
```

## Rollback Procedures

### Automatic Rollback

Automatic rollback triggers:

- Health check failures
- High error rate (>5%)
- High latency (P95 >1s)
- Analysis template failures

### Manual Rollback

#### Kubernetes Deployment

```bash
# View rollout history
kubectl rollout history deployment/prompt-builder-api -n production

# Rollback to previous version
kubectl rollout undo deployment/prompt-builder-api -n production

# Rollback to specific revision
kubectl rollout undo deployment/prompt-builder-api -n production --to-revision=3
```

#### ArgoCD

```bash
# View application history
argocd app history prompt-builder-production

# Rollback to previous version
argocd app rollback prompt-builder-production

# Rollback to specific revision
argocd app rollback prompt-builder-production 5
```

#### Argo Rollouts

```bash
# Abort canary rollout
kubectl argo rollouts abort prompt-builder-api

# Rollback to stable version
kubectl argo rollouts undo prompt-builder-api
```

#### AWS ECS

```bash
# Revert to previous task definition
aws ecs update-service \
  --cluster prompt-builder-production \
  --service prompt-builder-api \
  --task-definition prompt-builder-api:42 \
  --force-new-deployment
```

### Database Rollback

If database migrations were applied:

```bash
# Run down migration
npm run migrate:down

# Or restore from backup
pg_restore -d prompt_builder backup.dump
```

## Troubleshooting

### Deployment Failures

#### Pod CrashLoopBackOff

```bash
# Check pod logs
kubectl logs -n production pod/prompt-builder-api-xyz --previous

# Describe pod
kubectl describe pod -n production prompt-builder-api-xyz

# Common causes:
# - Missing environment variables
# - Failed health checks
# - Out of memory
# - Invalid configuration
```

#### ImagePullBackOff

```bash
# Check image pull secrets
kubectl get secret ghcr-pull-secret -n production -o yaml

# Verify image exists
docker pull ghcr.io/bharm16/prompt-builder:tag

# Update image pull secret
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=USERNAME \
  --docker-password=PAT
```

#### Deployment Timeout

```bash
# Check deployment status
kubectl rollout status deployment/prompt-builder-api -n production

# Check pod events
kubectl get events -n production --sort-by='.lastTimestamp'

# Common causes:
# - Insufficient resources
# - Node affinity issues
# - Slow image pull
# - Failed health checks
```

### Performance Issues

#### High Latency

```bash
# Check pod metrics
kubectl top pods -n production -l app=prompt-builder

# Check HPA status
kubectl get hpa -n production

# Scale manually if needed
kubectl scale deployment/prompt-builder-api --replicas=10 -n production
```

#### Memory Leaks

```bash
# Get memory usage
kubectl top pod -n production -l app=prompt-builder

# Restart pods with high memory
kubectl delete pod -n production pod-name

# Enable memory profiling
kubectl exec -it pod-name -- node --heap-prof server.js
```

### Security Issues

#### Certificate Expired

```bash
# Check certificate
kubectl get certificate -n production

# Renew with cert-manager
kubectl delete certificate prompt-builder-tls -n production
kubectl apply -f k8s/base/ingress.yaml
```

#### Secrets Not Loading

```bash
# Check secret exists
kubectl get secret prompt-builder-secrets -n production

# Check External Secrets Operator
kubectl get externalsecret -n production
kubectl describe externalsecret prompt-builder-secrets -n production
```

### Monitoring Issues

#### Missing Metrics

```bash
# Check ServiceMonitor
kubectl get servicemonitor -n production

# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Visit http://localhost:9090/targets
```

#### Alerts Not Firing

```bash
# Check PrometheusRule
kubectl get prometheusrule -n production

# Check Alertmanager
kubectl logs -n monitoring alertmanager-0
```

## Best Practices

### Pre-Deployment Checklist

- [ ] All tests passing (unit, integration, E2E)
- [ ] Security scans passed
- [ ] Code review approved
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring dashboards updated
- [ ] On-call engineer notified
- [ ] Change ticket created

### During Deployment

- [ ] Monitor error rates
- [ ] Watch latency metrics
- [ ] Check pod health
- [ ] Verify traffic routing
- [ ] Test critical user flows
- [ ] Monitor resource usage

### Post-Deployment

- [ ] Verify all pods healthy
- [ ] Check application logs
- [ ] Run smoke tests
- [ ] Monitor for 30 minutes
- [ ] Update changelog
- [ ] Close change ticket
- [ ] Document any issues

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [Argo Rollouts Documentation](https://argoproj.github.io/argo-rollouts/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Prometheus Documentation](https://prometheus.io/docs/)

## Support

For deployment issues:

1. Check this guide first
2. Review application logs
3. Check monitoring dashboards
4. Contact DevOps team on Slack: #prompt-builder-ops
5. Create incident ticket if critical
