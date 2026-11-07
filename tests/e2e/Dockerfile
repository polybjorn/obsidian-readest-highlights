# The image the forge runner's docker label runs, so a local run and CI see the
# same system. tests/e2e/docker.sh builds and runs it.
FROM node:26-trixie@sha256:6d2c7d5d074bf72f81ddc252b4fbb5d625bc028eeda49cb4b8c2ff8eda1ee617
COPY apt-packages.txt /tmp/
RUN apt-get update \
  && xargs -a /tmp/apt-packages.txt apt-get install -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
