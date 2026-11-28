# OpenVScan review sandbox: open-source scanners + headless coding agents.
#
# The container has NO direct internet access at run time. Every HTTP(S)
# request goes through the engine Worker's `Outbound` entrypoint, which only
# allows what the current pipeline phase needs and injects credentials (the
# GitHub clone token, the user's model credential) at the egress, so
# no secret ever exists inside this image or its processes.
#
# Bump the pins below deliberately, with their checksums (listed on each
# release's assets): CLI flags and output formats change between releases,
# and the parsers in engine/src/scanners depend on them.
ARG SANDBOX_VERSION=1.0.3
FROM docker.io/cloudflare/sandbox:${SANDBOX_VERSION} AS sandbox

# ---------------------------------------------------------------------------
# OpenGrep and its rules, built in their own stage so Python stays out of the
# final image. rules/curate.py keeps the vulnerability rules from each pack
# (see its docstring); rules/prune.sh then drops any rule OpenGrep can't
# parse, since one bad rule aborts a whole scan.
FROM python:3.13-slim AS rules

ARG TARGETARCH
ARG OPENGREP_VERSION=2.1.0
ARG OPENGREP_SHA256_AMD64=d6a68a84c01a3d8ee933f60847decf1b4d0fd7791a26833b32b95922baf28974
ARG OPENGREP_SHA256_ARM64=3abfc87d66f208efd143a1b408d489af934cea7d9968ab1f37dca001f9886092
# Rule packs, each pinned to a commit. Licences: opengrep-rules LGPL-2.1 with
# the Commons Clause; GitLab sast-rules MIT, its rules/lgpl LGPL-3.0; Trail of
# Bits AGPL-3.0; 0xdea MIT. Each pack's licence is copied next to its rules.
ARG OPENGREP_RULES_COMMIT=f1d2b562b414783763fd02a6ed2736eaed622efa
ARG GITLAB_RULES_COMMIT=83144bd2ec7d3200cda96347fa923f81c8ad8413
ARG TRAILOFBITS_RULES_COMMIT=31390b3a99c04c81522d1b37c8d1900aa2dd4094
ARG OXDEA_RULES_COMMIT=0c6df4b12563b7834ccaf0bf1bbb91809f376429

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir pyyaml==6.0.3

RUN case "$TARGETARCH" in arm64) a=aarch64 sum=$OPENGREP_SHA256_ARM64 ;; *) a=x86 sum=$OPENGREP_SHA256_AMD64 ;; esac \
  && curl -sSfL -o /usr/local/bin/opengrep \
    "https://github.com/opengrep/opengrep/releases/download/v${OPENGREP_VERSION}/opengrep_linux_${a}" \
  && echo "$sum  /usr/local/bin/opengrep" | sha256sum -c - \
  && chmod +x /usr/local/bin/opengrep

COPY rules/ /build/
RUN set -e; \
  fetch() { git init -q "/packs/$1" && git -C "/packs/$1" fetch -q --depth 1 "$2" "$3" && git -C "/packs/$1" checkout -q FETCH_HEAD; }; \
  fetch opengrep https://github.com/opengrep/opengrep-rules "$OPENGREP_RULES_COMMIT"; \
  fetch gitlab https://gitlab.com/gitlab-org/security-products/sast-rules.git "$GITLAB_RULES_COMMIT"; \
  fetch trailofbits https://github.com/trailofbits/semgrep-rules "$TRAILOFBITS_RULES_COMMIT"; \
  fetch 0xdea https://github.com/0xdea/semgrep-rules "$OXDEA_RULES_COMMIT"; \
  cd /packs; \
  python3 -I /build/curate.py /opt/opengrep-rules \
    opengrep=opengrep:apex,bash,c,clojure,csharp,elixir,go,java,javascript,kotlin,ocaml,php,python,ruby,rust,scala,solidity,swift,typescript,html \
    gitlab=gitlab:c,csharp,go,java,javascript,python,scala,rules/lgpl \
    trailofbits=trailofbits:go,javascript,jvm,python,rs,ruby,swift \
    0xdea=0xdea/rules; \
  for p in opengrep gitlab trailofbits 0xdea; do \
    for f in LICENSE LICENSE.md LICENSE.txt; do \
      [ -f "/packs/$p/$f" ] && cp "/packs/$p/$f" "/opt/opengrep-rules/$p/$f"; \
    done; \
  done; \
  for f in /packs/gitlab/rules/lgpl/LICENSE*; do [ -f "$f" ] && cp "$f" /opt/opengrep-rules/gitlab/rules/lgpl/; done; \
  sh /build/prune.sh /opt/opengrep-rules

# ---------------------------------------------------------------------------
FROM node:24-trixie-slim

ARG TARGETARCH
ARG TRIVY_VERSION=0.76.2
ARG TRIVY_SHA256_AMD64=bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf
ARG TRIVY_SHA256_ARM64=ab9d51f86e6a5fb936f605faff6b593ac51bc378fff4d3e8b9d58358b9c367c3
ARG GITLEAKS_VERSION=8.30.1
ARG GITLEAKS_SHA256_AMD64=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
ARG GITLEAKS_SHA256_ARM64=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080
ARG OSV_SCANNER_VERSION=2.7.1
ARG OSV_SCANNER_SHA256_AMD64=fb7dab19a8bd9bbe5c3189f09d4b7ee1820c9553a23bac202648a56efd2f6ee8
ARG OSV_SCANNER_SHA256_ARM64=983d22fbad9724514e3fcc6acc83b5fa64c5ffa6b0d9f510028f22c1b223ff81
ARG ZIZMOR_VERSION=1.33.1
ARG ZIZMOR_SHA256_AMD64=3e6a301c7a820a2501915f5a9de8c0486da82bdec7965f068477538a98743d43
ARG ZIZMOR_SHA256_ARM64=aa487c792a7cbbe86e4f8dccd3b66de33b3b51813c090aaa0842d7ea08a3fc35
ARG CLAUDE_CODE_VERSION=2.1.332
ARG CODEX_VERSION=0.172.0
ARG CURSOR_AGENT_VERSION=2026.11.22-e9042b2

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git jq ripgrep \
  && rm -rf /var/lib/apt/lists/*

# --- Scanners, each checked against its pinned SHA-256. They run on the
# checkout with no network, except OSV-Scanner, which may query api.osv.dev
# (see engine/src/egress-rules.ts).
RUN set -e; cd /tmp; \
  get() { curl -sSfL -o "$2" "$1" && echo "$3  $2" | sha256sum -c - >/dev/null; }; \
  if [ "$TARGETARCH" = arm64 ]; then \
    get "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-ARM64.tar.gz" trivy.tgz "$TRIVY_SHA256_ARM64"; \
    get "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_arm64.tar.gz" gitleaks.tgz "$GITLEAKS_SHA256_ARM64"; \
    get "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_arm64" osv-scanner "$OSV_SCANNER_SHA256_ARM64"; \
    get "https://github.com/zizmorcore/zizmor/releases/download/v${ZIZMOR_VERSION}/zizmor-aarch64-unknown-linux-gnu.tar.gz" zizmor.tgz "$ZIZMOR_SHA256_ARM64"; \
  else \
    get "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" trivy.tgz "$TRIVY_SHA256_AMD64"; \
    get "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" gitleaks.tgz "$GITLEAKS_SHA256_AMD64"; \
    get "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_amd64" osv-scanner "$OSV_SCANNER_SHA256_AMD64"; \
    get "https://github.com/zizmorcore/zizmor/releases/download/v${ZIZMOR_VERSION}/zizmor-x86_64-unknown-linux-gnu.tar.gz" zizmor.tgz "$ZIZMOR_SHA256_AMD64"; \
  fi; \
  tar -xzf trivy.tgz -C /usr/local/bin trivy; \
  tar -xzf gitleaks.tgz -C /usr/local/bin gitleaks; \
  tar -xzf zizmor.tgz -C /usr/local/bin zizmor; \
  install -m 755 osv-scanner /usr/local/bin/osv-scanner; \
  rm -f trivy.tgz gitleaks.tgz zizmor.tgz osv-scanner; \
  curl -sSfL -o /opt/gitleaks.toml \
    "https://raw.githubusercontent.com/gitleaks/gitleaks/v${GITLEAKS_VERSION}/config/gitleaks.toml"

COPY --from=rules /usr/local/bin/opengrep /usr/local/bin/opengrep
COPY --from=rules /opt/opengrep-rules /opt/opengrep-rules

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
# osv-scanner.toml is empty on purpose: the PR's own config can't ignore advisories.
RUN chmod +x /opt/openvscan/*.sh && touch /opt/openvscan/osv-scanner.toml

WORKDIR /workspace
CMD ["sleep", "infinity"]
