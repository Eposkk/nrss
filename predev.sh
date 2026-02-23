#!/bin/bash
# Start docker services if not already running

check_port() {
  lsof -i :"$1" >/dev/null 2>&1
}

if check_port 6380; then
  echo "Docker services already running, skipping docker compose up"
else
  docker compose up -d
fi
