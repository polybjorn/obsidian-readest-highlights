# The image the forge runner's docker label runs, so a local run and CI see the
# same system. tests/e2e/docker.sh builds and runs it.
FROM node:26-trixie@sha256:e18c3ccdf7d71619990b0e85639f506e2028a95410999cab24cc373cbd10e0ac
COPY apt-packages.txt /tmp/
RUN apt-get update \
  && xargs -a /tmp/apt-packages.txt apt-get install -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
