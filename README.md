# Kaśka

A lightweight browser GUI for Apache Cassandra.

## Features

- Browse keyspaces and tables
- View, insert, edit, and delete rows
- CQL editor with keyboard shortcut (`Ctrl+Enter` / `Cmd+Enter`)
- Schema viewer
- Dark / light theme toggle

## Usage

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
