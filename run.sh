#!/bin/sh
set -e

command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed."; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "npm is required but not installed."; exit 1; }

BASE="https://raw.githubusercontent.com/barelief/kaska/main"
DIR=$(mktemp -d)
cd "$DIR"

echo "Downloading Kaśka..."
curl -fsSL "$BASE/package.json" -o package.json
curl -fsSL "$BASE/server.js"    -o server.js
curl -fsSL "$BASE/index.html"   -o index.html
curl -fsSL "$BASE/dev.js"       -o dev.js

echo "Installing dependencies..."
npm install --silent

echo "Starting Kaśka..."
node dev.js
