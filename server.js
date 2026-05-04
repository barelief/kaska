/**
 * Kaśka — Node.js proxy
 * Bridges the browser GUI to a real Cassandra cluster.
 * Run: node server.js
 * Listens on http://localhost:8765
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const cassandra = require("cassandra-driver");

const PORT = 8765;

let client = null;

// ── CORS helper ────────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, data) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ── Route handlers ─────────────────────────────────────────────────────────────

// POST /connect  { host, port, localDataCenter, username?, password? }
async function handleConnect(req, res) {
  const body = await readBody(req);
  const {
    host = "127.0.0.1",
    port = 4000,
    localDataCenter = "datacenter1",
    username,
    password,
  } = body;

  if (client) {
    try {
      await client.shutdown();
    } catch (_) {}
    client = null;
  }

  const opts = {
    contactPoints: [`${host}:${port}`],
    localDataCenter,
  };
  if (username && password) {
    opts.credentials = { username, password };
  }

  client = new cassandra.Client(opts);
  try {
    await client.connect();
    json(res, 200, { ok: true, message: `Connected to ${host}:${port}` });
  } catch (err) {
    client = null;
    json(res, 500, { ok: false, error: err.message });
  }
}

// POST /disconnect
async function handleDisconnect(req, res) {
  if (client) {
    try {
      await client.shutdown();
    } catch (_) {}
    client = null;
  }
  json(res, 200, { ok: true });
}

// GET /keyspaces
async function handleKeyspaces(req, res) {
  if (!client) return json(res, 400, { error: "Not connected" });
  try {
    const result = await client.execute(
      "SELECT keyspace_name FROM system_schema.keyspaces",
    );
    const keyspaces = result.rows.map((r) => r.keyspace_name);
    json(res, 200, { keyspaces });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

// GET /tables?keyspace=xxx
async function handleTables(req, res) {
  if (!client) return json(res, 400, { error: "Not connected" });
  const url = new URL(req.url, `http://localhost`);
  const keyspace = url.searchParams.get("keyspace");
  if (!keyspace) return json(res, 400, { error: "keyspace param required" });
  try {
    const result = await client.execute(
      "SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?",
      [keyspace],
      { prepare: true },
    );
    const tables = result.rows.map((r) => r.table_name);
    json(res, 200, { tables });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

// GET /schema?keyspace=xxx&table=yyy
async function handleSchema(req, res) {
  if (!client) return json(res, 400, { error: "Not connected" });
  const url = new URL(req.url, `http://localhost`);
  const keyspace = url.searchParams.get("keyspace");
  const table = url.searchParams.get("table");
  if (!keyspace || !table)
    return json(res, 400, { error: "keyspace and table required" });
  try {
    const result = await client.execute(
      `SELECT column_name, type, kind FROM system_schema.columns
       WHERE keyspace_name = ? AND table_name = ?`,
      [keyspace, table],
      { prepare: true },
    );
    const columns = result.rows.map((r) => ({
      name: r.column_name,
      type: r.type,
      pk: r.kind === "partition_key",
      ck: r.kind === "clustering",
    }));
    json(res, 200, { columns });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

// GET /rows?keyspace=xxx&table=yyy&limit=100
async function handleRows(req, res) {
  if (!client) return json(res, 400, { error: "Not connected" });
  const url = new URL(req.url, `http://localhost`);
  const keyspace = url.searchParams.get("keyspace");
  const table = url.searchParams.get("table");
  const limit = Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200);
  if (!keyspace || !table)
    return json(res, 400, { error: "keyspace and table required" });
  try {
    const result = await client.execute(
      `SELECT * FROM "${keyspace}"."${table}" LIMIT ${limit}`,
    );
    // Serialize rows — convert Cassandra types to plain JS
    const rows = result.rows.map((row) => {
      const obj = {};
      result.columns.forEach((col) => {
        const v = row[col.name];
        obj[col.name] = v === null || v === undefined ? null : String(v);
      });
      return obj;
    });
    json(res, 200, { rows, columns: result.columns.map((c) => c.name) });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

// POST /query  { cql, params? }
async function handleQuery(req, res) {
  if (!client) return json(res, 400, { error: "Not connected" });
  const body = await readBody(req);
  const { cql, params = [] } = body;
  if (!cql) return json(res, 400, { error: "cql required" });
  const start = Date.now();
  try {
    const result = await client.execute(cql, params, {
      prepare: params.length > 0,
    });
    const elapsed = Date.now() - start;
    const rows = (result.rows || []).map((row) => {
      const obj = {};
      (result.columns || []).forEach((col) => {
        const v = row[col.name];
        obj[col.name] = v === null || v === undefined ? null : String(v);
      });
      return obj;
    });
    json(res, 200, {
      ok: true,
      rows,
      columns: (result.columns || []).map((c) => c.name),
      rowCount: rows.length,
      elapsed,
    });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

// POST /insert  { keyspace, table, row: { col: val, ... } }
async function handleInsert(req, res) {
  if (!client) return json(res, 400, { error: "Not connected" });
  const body = await readBody(req);
  const { keyspace, table, row } = body;
  if (!keyspace || !table || !row)
    return json(res, 400, { error: "keyspace, table, row required" });

  const cols = Object.keys(row);
  const vals = Object.values(row);
  const placeholders = cols.map(() => "?").join(", ");
  const cql = `INSERT INTO "${keyspace}"."${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`;

  try {
    await client.execute(cql, vals, { prepare: true });
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

// POST /update  { keyspace, table, row, pkColumns: ['col1', ...] }
async function handleUpdate(req, res) {
  if (!client) return json(res, 400, { error: "Not connected" });
  const body = await readBody(req);
  const { keyspace, table, row, pkColumns } = body;
  if (!keyspace || !table || !row || !pkColumns?.length)
    return json(res, 400, {
      error: "keyspace, table, row, pkColumns required",
    });

  const setCols = Object.keys(row).filter((c) => !pkColumns.includes(c));
  if (!setCols.length)
    return json(res, 400, { error: "No non-PK columns to update" });

  const setClause = setCols.map((c) => `"${c}" = ?`).join(", ");
  const whereClause = pkColumns.map((c) => `"${c}" = ?`).join(" AND ");
  const vals = [...setCols.map((c) => row[c]), ...pkColumns.map((c) => row[c])];
  const cql = `UPDATE "${keyspace}"."${table}" SET ${setClause} WHERE ${whereClause}`;

  try {
    await client.execute(cql, vals, { prepare: true });
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

// POST /delete  { keyspace, table, pkColumns: ['col'], row }
async function handleDelete(req, res) {
  if (!client) return json(res, 400, { error: "Not connected" });
  const body = await readBody(req);
  const { keyspace, table, row, pkColumns } = body;
  if (!keyspace || !table || !row || !pkColumns?.length)
    return json(res, 400, {
      error: "keyspace, table, row, pkColumns required",
    });

  const whereClause = pkColumns.map((c) => `"${c}" = ?`).join(" AND ");
  const vals = pkColumns.map((c) => row[c]);
  const cql = `DELETE FROM "${keyspace}"."${table}" WHERE ${whereClause}`;

  try {
    await client.execute(cql, vals, { prepare: true });
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

// ── Router ─────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = req.url.split("?")[0];

  try {
    if (req.method === "POST" && pathname === "/connect")
      return await handleConnect(req, res);
    if (req.method === "POST" && pathname === "/disconnect")
      return await handleDisconnect(req, res);
    if (req.method === "GET" && pathname === "/keyspaces")
      return await handleKeyspaces(req, res);
    if (req.method === "GET" && pathname === "/tables")
      return await handleTables(req, res);
    if (req.method === "GET" && pathname === "/schema")
      return await handleSchema(req, res);
    if (req.method === "GET" && pathname === "/rows")
      return await handleRows(req, res);
    if (req.method === "POST" && pathname === "/query")
      return await handleQuery(req, res);
    if (req.method === "POST" && pathname === "/insert")
      return await handleInsert(req, res);
    if (req.method === "POST" && pathname === "/update")
      return await handleUpdate(req, res);
    if (req.method === "POST" && pathname === "/delete")
      return await handleDelete(req, res);
    if (req.method === "GET" && pathname === "/") {
      cors(res);
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(path.join(__dirname, "index.html")).pipe(res);
      return;
    }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Kaśka running on http://localhost:${PORT}`);
  console.log("Waiting for connections from the browser GUI...");
});
