# Architecture

<!-- okf:generated:start -->
## Generated facts
- Manifests: go.mod, package.json
<!-- okf:generated:end -->

## Curated constraints

### Backend Layer Boundaries (Go)
1. **Domain (`backend/internal/domain`)**: Core business logic and domain entities. Must NEVER import adapters, repository, transport, bootstrap, features, or ports.
2. **Ports (`backend/internal/ports`)**: Protocol interfaces for secondary capabilities. May only import domain.
3. **Features (`backend/internal/features`)**: High-level application flows. May import domain and ports; must not import adapters, repository, transport, or bootstrap.
4. **Adapters & Repositories (`backend/internal/adapters`, `backend/internal/repository`)**: Data access and infrastructure implementations.
5. **Transport (`backend/internal/transport`)**: HTTP and WebSocket entrypoints.
6. **Bootstrap (`backend/internal/bootstrap`)**: Dependency injection and wiring.

### Frontend Layer Boundaries (React / TypeScript)
Layer hierarchy: `config/design-system -> utils/api -> features/components -> pages`
- Circular dependencies are strictly forbidden.
- `config` and `design-system` must not depend on higher application layers.
- `utils` and `api` must not depend on features, components, or pages.
- `components` and `features` must not depend on `pages`.
