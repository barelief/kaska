# Kaśka

A lightweight browser GUI for Apache Cassandra.

## Features

- Browse keyspaces and tables
- View, insert, edit, and delete rows
- CQL editor with keyboard shortcut (`Ctrl+Enter` / `Cmd+Enter`)
- Schema viewer
- Dark / light theme toggle

## Usage

### One-liner (no clone needed)

```bash
curl -fsSL https://raw.githubusercontent.com/barelief/kaska/main/run.sh | bash
```

Downloads the app into a temp directory, installs dependencies, and opens the browser automatically.

### From source

```bash
pnpm install
pnpm dev       # starts the proxy and opens the browser
```

Or start just the server:

```bash
pnpm start
```

The proxy listens on `http://localhost:8765`. Open that URL in your browser and connect to your Cassandra cluster.

## Requirements

- Node.js
- A running Cassandra cluster
