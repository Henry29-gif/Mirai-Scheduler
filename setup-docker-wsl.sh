#!/usr/bin/env bash
# One-time setup: installs a real Docker engine inside Ubuntu (WSL),
# bypassing the broken Docker Desktop. You'll be asked for your Ubuntu
# password once (typing is invisible — that's normal; press Enter).
set -e

echo "==> [1/4] Updating Ubuntu package list..."
sudo apt-get update -y

echo "==> [2/4] Installing Docker engine..."
sudo apt-get install -y docker.io

echo "==> [3/4] Starting Docker and enabling it on boot..."
sudo systemctl enable --now docker

echo "==> [4/4] Allowing your user to run Docker without sudo..."
sudo usermod -aG docker "$USER"

echo ""
echo "============================================================"
echo " Docker installed: $(sudo docker --version)"
echo " ALL DONE. Go back to Claude Code — it will finish the rest."
echo "============================================================"
