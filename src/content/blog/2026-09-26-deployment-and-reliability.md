---
title: 'Development update: deployment and reliability'
description: 'Quasar now talks to Docker and Podman through their APIs, and a preview of a much simpler compose file.'
date: 2026-09-26
projects: [quasar]
---

Hey everyone,

I wanted to give an update on what I've been working on with Quasar this past week. The theme has been **deployment and reliability**.

## Orchestration rework

I've refactored the orchestration layer underneath Quasar. Instead of shelling out to the Docker CLI, it now uses the container engine's API directly, and Podman is now a native target it can manage alongside Docker. Rootless Podman isn't there yet, but I've now got some awesome data from the community, so that's probably the next step.

## Making Quasar way easier to deploy

I tried deploying Quasar myself at a friend's place, and honestly, the number of variables and manual config steps it takes to stand up was totally unacceptable. I'm genuinely surprised that some of you have deployed it successfully already. To everyone who took the plunge and got it running: thank you, that's great.

So here's a preview of what the compose file should look like going forward. The goal is a single seed service that brings up the rest of the stack for you.

> ⚠️ **Preview only. Please DO NOT actually use this yet.** It will change before release.

```yaml
services:
  quasar-seed:
    image: ghcr.io/accreleus/quasar/quasar-recovery:latest
    command: seed
    restart: unless-stopped
    security_opt: [label=disable]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - quasar-machine:/var/lib/quasar-machine:ro
    environment:
      QUASAR_ROLE: combined
      QUASAR_PUBLIC_HOST: quasar.example.com
      QUASAR_NODE_NAME: quasar-home
      QUASAR_HOME_ROOT: /var/lib/quasar/homes
      QUASAR_CONTROL_PLANE_IMAGE: ghcr.io/accreleus/quasar/quasar-control-plane:latest
      QUASAR_AGENT_IMAGE: ghcr.io/accreleus/quasar/quasar-node-agent:latest
      QUASAR_UPDATER_ALLOWED_NAMESPACES: ghcr.io/accreleus/quasar
volumes:
  quasar-machine:
    name: quasar-machine
```

As always, questions and feedback are welcome, especially if you're running Podman.
