---
title: Deployment Guide
tags: [devops, infrastructure]
description: How to deploy the application to production
---
# Deployment Guide

## Prerequisites

You need **Docker** and `kubectl` installed. See the [installation guide]([https://example.com/](https://example.com/)

## Steps

1. Build the container image
2. Push to registry
3. Apply the Kubernetes

ssss

### Build

- Clone the repository
  - Ensure you have access to the private
  - Set up your credentials
- Run the build script

```typescript
const config = {
  registry: "ghcr.io/org/app",
  tag: process.env.VERSION || "latest",
};

await docker.build(config);
```


| Environment | URL                 | Status  |
| ----------- | ------------------- | ------- |
| Staging     | staging.example.com | Active  |
| Production  | app.example.com     | Active  |
| Canary      | canary.example.com  | Limited |


> **Note:** Always deploy to staging first. Production deployments require approval from the platform team.

---

## Checklist

- [x] Completed task
- [ ] Pending task
- [ ] Another pending task