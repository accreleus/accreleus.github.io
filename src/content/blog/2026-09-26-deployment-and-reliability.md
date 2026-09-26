---
title: 'Development update: deployment and reliability'
description: 'Why I pulled Quasar off the Docker CLI, taught it to check a host before it launches anything, and am replacing a 60-variable compose file with a single seed container.'
date: 2026-09-26
projects: [quasar]
---

Hey everyone,

I wanted to give an update on what I've been working on with Quasar. The theme has been **deployment and reliability**, and this one is longer than usual, because I want to explain not just what changed but why.

## A night at a friend's place

A little while ago I went round to a friend's place to set Quasar up on their Unraid server.

The first wall was the **NVIDIA driver**. Unraid ships a driver that's older than what Quasar needs, so we updated it. That got us past the first error and straight into the next one: the **EGL files weren't being mounted and picked up** properly, so the part of Quasar that draws the game's picture couldn't start.

Then there was **Arcane**, which we were using to deploy the stack. The way Arcane handles container labels meant Quasar couldn't read the labels it relies on, which caused a whole extra set of problems. So we tried Unraid's own Compose plugin instead, and hit much the same issues. Plain `docker compose` got us the furthest, but we were still fighting the EGL drivers, plus a few other things we just couldn't track down.

By about 8:30, 9 o'clock we hadn't got any closer to launching Steam and streaming it. It was one issue after another, and I had to call it. I never did get Quasar running on my friend's Unraid box.

## What that night taught me

Looking back, a few things were pretty clear.

**There were far too many knobs.** The compose template and its `.env` had well over 60 variables. That's great while you're developing and want to flip things on and off to test them. It's a terrible experience for someone who just wants to play games. Honestly, I'm surprised some of you got it running at all. To everyone who did: thank you.

**The errors weren't accurate enough.** Quasar's errors were somewhat helpful, but more than once the real problem turned out to be something different from what the error said. When you're debugging on someone else's machine, a wrong hint is worse than no hint.

**The logs were in too many places.** Getting to the bottom of anything meant reading the logs of several containers and piecing the story together yourself.

**It was more complex than it needed to be.** There were a lot of moving parts for what should be a fairly simple install.

That led to two decisions. First, a small, lightweight container that looks at the machine it's on (what GPU you've got, what it can do, how the host is set up) and stands the rest of Quasar up correctly, so you don't have to. Second, stop driving everything through the Docker CLI.

Here's where that's landing. On each machine, the seed makes sure a recovery actor exists, and the actor installs and replaces everything else. The node agent reports to the control plane and owns the game containers. Releases come from GitHub, and images are pulled from GHCR by digest.

[![Quasar's new architecture on a combined host. The seed ensures the recovery actor exists. The actor takes requests from the control plane over a control socket and from the node agent over an agent socket, and pulls images from ghcr.io/accreleus/quasar by digest. The node agent connects to the control plane over a secure WebSocket, streams to the browser over WebRTC, and launches the session containers. The control plane stores desired host state in Postgres and reads the release manifest from GitHub Releases.](/blog/2026-09-26-deployment-and-reliability/quasar-architecture.png)](/blog/2026-09-26-deployment-and-reliability/quasar-architecture.png)

*The new architecture on a combined host. Select the diagram to open it full size.*

## Step one: talk to the engine, not the CLI

Quasar used to orchestrate everything by shelling out to `docker`. That's a good way to start: it's simple and easy to test. But it ties you to Docker. It works pretty well with Podman, up to a point, and that's about it. I want Quasar to run on rootless Podman, on LXC containers (Proxmox, and Unraid through a plugin), and eventually on Kubernetes. The CLI was never going to get us there.

So the node agent now talks to the container engine's API directly over its socket, using [Bollard](https://github.com/fussybeaver/bollard) in Rust. That covers every operation: pulling and building images, launching and stopping apps, audio, GPU diagnostics, the lot. The agent image doesn't even ship a `docker` binary any more. There's a test that walks the source tree to make sure nobody (me included) sneaks a shell-out back in:

```rust
//! The agent talks to the container engine only through its HTTP API (#239).
//!
//! The image ships no `docker`/`podman` executable, so a `Command::new("docker")`
//! would not fail loudly — it would fail at the exact moment a session or a boot
//! sweep needed it, on a host nobody is watching. This walks the real source tree
//! so a reintroduced shell-out fails on the commit that adds it.
```

Going through the API also means errors come back as types Quasar understands, rather than text scraped from a terminal. Raw daemon messages never reach you directly. They're sorted into kinds like "permission denied", "unavailable" or "registry denied" (excerpt):

```rust
/// Safe to surface to callers. Raw daemon messages never become public errors.
#[derive(Debug, Clone)]
pub struct RuntimeError {
    pub kind: ErrorKind,
```

This is milestone [RH-01](https://github.com/accreleus/quasar/milestone/1), and it's done.

## Step two: tell you what's wrong before you hit it

Remember the EGL files? The old Quasar would happily accept a session on that host and then fall over when the game started. Now the node agent probes the host first, and reports a list of readiness checks to the console. Each one comes with a plain-language summary and the commands to fix it (abridged):

```rust
pub struct ReadinessCheck {
    /// Stable machine key, e.g. `"nvidia_egl_vendor_json"`.
    pub id: String,
    /// `"pass" | "fail" | "skip" | "warn" | "provisioning" | "unknown"`.
    pub status: String,
    /// One sentence an operator can act on, in plain language.
    pub summary: String,
    /// Exact commands to fix it, distro-aware where cheaply knowable. Empty
    /// for `pass`/`skip`.
    pub remediation: String,
```

And here's the check that would have saved me that night:

```rust
/// `10_nvidia.json` — the glvnd vendor config. Without it EGL enumerates no
/// NVIDIA vendor at all and the compositor panics on display creation (#462).
fn check_nvidia_egl_vendor(env: &ProbeEnv, distro: Distro) -> ReadinessCheck {
    const ID: &str = "nvidia_egl_vendor_json";
    if !env.nvidia {
        return skip(ID, "no NVIDIA GPU detected on this host");
    }
    // ...
        "no NVIDIA EGL vendor config (10_nvidia.json) — the driver is installed \
         CUDA-only, so the session compositor will crash on startup",
```

A check is only allowed to block launches when it rests on real evidence: a probe that actually exercised the path a session would use. Guesses stay as warnings. If a host isn't ready, players get a clear `host_not_ready` instead of a stream that never starts, and the admin gets the specific check that failed, right on the host's card.

Building this shook out some real bugs, too:

- NVIDIA hosts that use the container toolkit were wrongly blocked from every launch.
- A host whose only GPU was index 1 refused every launch.
- AMD hosts needed an opt-in setting to get a clean Vulkan encode. That's now the default.

That's [RH-02](https://github.com/accreleus/quasar/milestone/2), also done.

## Step three: host settings you set once

[RH-05](https://github.com/accreleus/quasar/milestone/5) moved host configuration out of environment variables and into settings stored by the control plane. You change a setting in the console, Quasar applies it when the host is idle, and it shows you whether it took. Supported hardware is now configured automatically, and you choose which hosts get which apps instead of every host pulling every image. Done as well.

## Step four: the seed

This is the part that answers that night most directly, and it's [RH-06](https://github.com/accreleus/quasar/milestone/6), about halfway through right now.

You start one small container, the **seed**. It works out the GPU and what the card can do, and how the host should be set up. Then it stands up the control plane, the node agent and the database for you. It also brings stronger security defaults, like only pulling Quasar images from an allowed registry namespace (`ghcr.io/accreleus/quasar` by default). The database password and secret key are generated for you and handed over as files, never as environment variables.

A machine plays one of three roles:

```rust
pub fn parse_role(raw: &str) -> Result<MachineRole, String> {
    match raw {
        "gpu" => Ok(MachineRole::Gpu),
        "combined" => Ok(MachineRole::Combined),
        "control-only" | "control_only" => Ok(MachineRole::ControlOnly),
        other => Err(format!(
            "{ROLE}={other:?} is not a role: use gpu, combined or control-only"
        )),
    }
}
```

`combined` is the one-box install: control plane and a GPU host together. Adding a second GPU host is a single command from **Add host** in the console. That command can also be copied as a stack for Dockge or Arcane (yes, Arcane).

Done so far: the seed itself, first-install bootstrap, one-line enrollment and Add host, combined and control-only installs, and replacing an agent in place. Still to come: the recovery actor replacing itself, updates that migrate the database (with a backup check), and finally retiring the old Compose updater.

Here's a preview of what the compose file looks like right now:

> ⚠️ **Preview only. Please DO NOT actually use this yet.** It will change before release, and the images are pinned by digests that don't exist yet.

```yaml
services:
  quasar-seed:
    image: ghcr.io/accreleus/quasar/quasar-recovery@sha256:<digest>
    command: seed
    restart: unless-stopped
    security_opt: [label=disable]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - quasar-machine:/var/lib/quasar-machine:ro
    environment:
      QUASAR_ROLE: combined
      QUASAR_HOME_ROOT: /var/lib/quasar/homes
      QUASAR_TEMPLATE_ROOT: /var/lib/quasar/templates
      QUASAR_AGENT_IMAGE: ghcr.io/accreleus/quasar/quasar-node-agent@sha256:<digest>
volumes:
  quasar-machine:
    name: quasar-machine
```

Four settings instead of 60-odd. For someone like my friend, the goal is: set the role and your storage paths, start it, and Quasar stands itself up and is usable from the moment you log in.

## How I'm building it

I'm building this with AI coding agents, and the workflow matters as much as the model. I've leaned heavily on [Matt Pocock's skills](https://www.aihero.dev/skills-setup-matt-pocock-skills), and they chain together really nicely:

1. Start with a rough idea.
2. **grill-me** interrogates it until the details are nailed down.
3. **shaping** and a **spec** turn that into a proper specification.
4. **to-tickets** breaks the spec into GitHub issues (which is why the milestones above have so many).
5. **wayfinder** and **implement** do the build, ticket by ticket.

It's very good at making sure you've addressed every aspect of a feature before you write a line of code. On top of that I've started using **graft**, which cuts down the number of tool calls it takes to navigate the code base (a bit like graphify), and **archify**, which turns a description of an architecture into a diagram you can review.

On models: I tried OpenAI's GPT-6 Astra alongside Claude. The models are extremely good, but they burn through usage limits. Just trying to deliver RH-01 and RH-02, I went through three weekly resets in the space of a few days, which made it unusable. With Claude (Fable, plus Opus and Sonnet) I got a lot more done for the same budget.

## What's next

- **Finish RH-06**, then retire the old compose install.
- **Centralised logs**, so you're not reading five containers to find one problem. That's one I felt personally.
- **Rootless Podman** in [RH-07](https://github.com/accreleus/quasar/milestones). It's not ready today, and neither is LXC, so please don't try either yet.
- Per-session media workers, streams that survive an agent restart, and optional STUN/TURN are further down the list.

## Please use it

The best thing for any open source project is people using it. Honestly, about half the bugs I've fixed over the last few months came from someone giving Quasar a go, hitting something, and reporting it. So if you run it, break it, and [open an issue](https://github.com/accreleus/quasar/issues), you're helping make it better for everyone.

As always, questions and feedback are welcome.
