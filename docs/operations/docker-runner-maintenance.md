# Docker runner maintenance

The `Docker runner maintenance` workflow runs weekly on the Windows self-hosted
`tests` runner and can also be started manually. It reports Docker disk usage,
then removes only unused builder cache, stopped containers, and unused images
older than seven days. It does not prune volumes, networks, or resources still
referenced by running containers.

The production deploy steps retain their separate emergency recovery: when a
build fails with a disk-full error, they prune unused Docker resources and retry
once. The image publishing step also removes its run-scoped Buildx builder with
an `EXIT` trap. These targeted cleanups do not replace the weekly runner sweep.

Docker Desktop stores Linux container data in a virtual disk. Pruning frees
space inside that disk, but compacting its VHDX file requires stopping Docker
Desktop and WSL. The workflow deliberately does not stop those shared services;
compact the disk only during a planned runner maintenance window using the
machine's supported Docker Desktop procedure.
