# Multiserver gateway operations

The multiserver stack runs tenant containers named `stovo-backend-<slug>`. Root API, MCP, and Socket.IO routes use `BACKEND_UPSTREAMS` from `.env`; they must not point to the standalone stack's `backend-blue` service.

Backend deployment selects the sole registered or running tenant when no root upstream is configured. For multiple tenants, set the intended root server explicitly, for example `BACKEND_UPSTREAMS=stovo-backend-example:8000`. Cluster routes under `/s/<slug>` keep their individual destinations.

For an urgent deployment without repeating CI or releasing frontend assets:

```sh
gh workflow run pipeline.yml --ref master -f backend_deploy_only=true
```

This manual option skips Backend CI. Normal pipeline runs still require it. Deployment checks both the public website and the root authentication API after tenant rollout.
