#!/usr/bin/env bash
set -euo pipefail
REPO="anna-ssg/anna"
ARCH="Linux_x86_64"

LATEST_TAG="v4.0.0"

echo "Using anna $LATEST_TAG"
TARBALL="anna_${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$LATEST_TAG/$TARBALL"

echo "Downloading $URL..."
curl -L "$URL" | tar -xz

if [[ ! -f anna ]]; then
  echo "anna binary not found after extraction"
  exit 1
fi

chmod +x anna
echo "Running anna..."
./anna
