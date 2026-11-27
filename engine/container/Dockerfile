# OpenVScan review sandbox: open-source scanners + headless coding agents.
#
# The container has NO direct internet access at run time. Every HTTP(S)
# request goes through the engine Worker's `Outbound` entrypoint, which only
# allows what the current pipeline phase needs and injects credentials (the
# GitHub clone token, the user's model credential) at the egress, so
# no secret ever exists inside this image or its processes.
#
# Bump these pins deliberately: CLI flags and output formats change between
# releases, and the parsers in engine/src/scanners depend on them.
ARG SANDBOX_VERSION=1.0.3
FROM docker.io/cloudflare/sandbox:${SANDBOX_VERSION} AS sandbox

FROM node:24-trixie-slim

ARG TARGETARCH
ARG TRIVY_VERSION=0.76.2
ARG GITLEAKS_VERSION=8.30.1
ARG OPENGREP_VERSION=2.1.0
# Opengrep community rules (LGPL-2.1 + Commons Clause), pinned to a commit.
# Point this at your own rules repo if that licence doesn't suit your deployment.
ARG OPENGREP_RULES_REPO=https://github.com/opengrep/opengrep-rules
ARG OPENGREP_RULES_COMMIT=f1d2b562b414783763fd02a6ed2736eaed622efa
ARG CLAUDE_CODE_VERSION=2.1.332
ARG CODEX_VERSION=0.172.0
ARG CURSOR_AGENT_VERSION=2026.11.22-e9042b2

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git jq ripgrep \
  && rm -rf /var/lib/apt/lists/*

# --- Trivy (dependencies + IaC). The vulnerability DB is baked in as a
# fallback; runs refresh it through the egress proxy when it's stale.
ENV TRIVY_CACHE_DIR=/opt/trivy-cache
RUN curl -sSfL "https://raw.githubusercontent.com/aquasecurity/trivy/v${TRIVY_VERSION}/contrib/install.sh" \
    | sh -s -- -b /usr/local/bin "v${TRIVY_VERSION}" \
  && trivy image --download-db-only --no-progress --cache-dir "$TRIVY_CACHE_DIR"

# --- Gitleaks (secrets). Runs with the release's own default config, so a
# .gitleaks.toml in the reviewed repo can't switch rules off.
RUN arch="$(case "$TARGETARCH" in arm64) echo arm64 ;; *) echo x64 ;; esac)" \
  && curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${arch}.tar.gz" \
    | tar -xz -C /usr/local/bin gitleaks \
  && curl -sSfL -o /opt/gitleaks.toml \
    "https://raw.githubusercontent.com/gitleaks/gitleaks/v${GITLEAKS_VERSION}/config/gitleaks.toml"

# --- Opengrep (Semgrep-compatible SAST) + rules, trimmed to rule files only.
RUN arch="$(case "$TARGETARCH" in arm64) echo aarch64 ;; *) echo x86 ;; esac)" \
  && curl -sSfL -o /usr/local/bin/opengrep \
    "https://github.com/opengrep/opengrep/releases/download/v${OPENGREP_VERSION}/opengrep_linux_${arch}" \
  && chmod +x /usr/local/bin/opengrep \
  && git init -q /tmp/rules \
  && git -C /tmp/rules fetch -q --depth 1 "$OPENGREP_RULES_REPO" "$OPENGREP_RULES_COMMIT" \
  && git -C /tmp/rules checkout -q FETCH_HEAD \
  && mkdir -p /opt/opengrep-rules \
  && for d in /tmp/rules/*/; do case "$(basename "$d")" in scripts|stats|ai) ;; *) cp -r "$d" /opt/opengrep-rules/ ;; esac; done \
  && find /opt/opengrep-rules -type f ! \( -name '*.yaml' -o -name '*.yml' \) -delete \
  && find /opt/opengrep-rules -type f \( -name '*.test.yaml' -o -name '*.test.yml' \) -delete \
  && rm -rf /tmp/rules

# --- Coding agents, all driven headless by the engine.
RUN npm install --global "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && npm install --global --ignore-scripts "@openai/codex@${CODEX_VERSION}" \
  && npm cache clean --force

# Cursor ships a self-contained tarball (its own node). The signed SEA builds
# are only for macOS computer use, so they're dropped.
RUN arch="$(case "$TARGETARCH" in arm64) echo arm64 ;; *) echo x64 ;; esac)" \
  && mkdir -p /opt/cursor-agent \
  && curl -sSfL "https://downloads.cursor.com/lab/${CURSOR_AGENT_VERSION}/linux/${arch}/agent-cli-package.tar.gz" \
    | tar --strip-components=1 -xz -C /opt/cursor-agent \
  && rm -f /opt/cursor-agent/*-sea /opt/cursor-agent/*.mp4 \
  && ln -s /opt/cursor-agent/cursor-agent /usr/local/bin/cursor-agent

# Helper that @cloudflare/sandbox's `Files` API runs inside the container.
COPY --from=sandbox /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim

COPY scripts/ /opt/openvscan/
RUN chmod +x /opt/openvscan/*.sh

WORKDIR /workspace
CMD ["sleep", "infinity"]
