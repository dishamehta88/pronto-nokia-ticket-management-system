"use strict";

// =============================================================
// Pronto - Root Cause Analysis Management System (backend)
// Start with:  npm start     (or press F5 in VS Code)
// Settings (MySQL password, port...) live in the .env file.
// =============================================================

require("dotenv").config({ quiet: true });

const path = require("path");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

// ---------- configuration ----------
const PORT = Number(process.env.PORT) || 3000;
const DB_NAME = process.env.DB_NAME || "pronto_db";
const DB_CONFIG = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || ""
};

let pool; // created in initDatabase()

// ---------- small helpers ----------
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// "" / null / undefined -> null, otherwise the trimmed text
function clean(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text === "" ? null : text;
}

function todayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function cleanDate(value, label) {
    const text = clean(value);
    if (text === null) return null;
    const day = text.slice(0, 10);
    const parsed = new Date(`${day}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
        throw new HttpError(400, `${label} must be a valid date (YYYY-MM-DD).`);
    }
    return day;
}

function normalizeStatus(status) {
    const value = (status || "").toString().trim();
    if (!value) return "Open";
    const lower = value.toLowerCase();
    if (lower === "closed") return "Closed";
    if (lower === "open" || lower === "opened") return "Open";
    if (["in progress", "inprogress", "in_progress"].includes(lower)) return "In Progress";
    return value;
}

const isClosedStatus = (status) => normalizeStatus(status) === "Closed";

// NOTE: this role comes from a header the browser sends, so it is a convenience
// check for the UI, not real security. See README ("Known limitations").
function isAdminRequest(req) {
    return (req.headers["x-user-role"] || "").toString().trim().toLowerCase() === "admin";
}

// ---------- ticket field map (JSON key -> DB column) ----------
const TICKET_FIELDS = [
    { key: "intimateDate", col: "intimate_date", type: "date", label: "Received Date" },
    { key: "country", col: "country" },
    { key: "prontoNo", col: "pronto_no" },
    { key: "partCode", col: "part_code" },
    { key: "unitName", col: "unit_name" },
    { key: "partGroup", col: "part_group" },
    { key: "partFamily", col: "part_family" },
    { key: "unitVersion", col: "unit_version" },
    { key: "serialNumber", col: "serial_number" },
    { key: "faultDescription", col: "fault_description" },
    { key: "ownerType", col: "owner_type" },
    { key: "ownerName", col: "owner_name" },
    { key: "rdOwnerName", col: "rd_owner_name" },
    { key: "priority", col: "priority" },
    { key: "rcAnalysisSteps", col: "rc_analysis_steps" },
    { key: "feedbackToRd", col: "feedback_to_rd" },
    { key: "rdInstructionsFeedbackToRc", col: "rd_instructions_feedback_to_rc" },
    { key: "componentReplaced", col: "component_replaced" },
    { key: "finalSummary", col: "final_summary" },
    { key: "prontoRcaAnalysisStatus", col: "pronto_rca_analysis_status" },
    { key: "normalRepairStatus", col: "normal_repair_status" },
    { key: "rcaEndDate", col: "rca_end_date", type: "date", label: "RCA End Date" },
    { key: "additionalRemarks", col: "additional_remarks" }
];

const TICKET_DEFAULTS = {
    priority: "No Priority",
    rc_analysis_steps: "Tracking",
    pronto_rca_analysis_status: "Tracking",
    normal_repair_status: "Visual Check"
};

// Returns undefined when the client did not send the field at all
// (so an update can leave that column alone), otherwise the cleaned value.
function readField(body, field) {
    if (body[field.key] === undefined) return undefined;
    return field.type === "date" ? cleanDate(body[field.key], field.label) : clean(body[field.key]);
}

async function assertProntoNoIsFree(prontoNo, ignoreId) {
    const [rows] = await pool.query(
        "SELECT id FROM tickets WHERE LOWER(pronto_no) = LOWER(?) AND id <> ? LIMIT 1",
        [prontoNo, ignoreId || 0]
    );
    if (rows.length) {
        throw new HttpError(409, `Pronto Number "${prontoNo}" already exists (ticket #${rows[0].id}).`);
    }
}

// ---------- database setup ----------
const CREATE_TABLES = [
    `CREATE TABLE IF NOT EXISTS tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        intimate_date DATE,
        country VARCHAR(100),
        pronto_no VARCHAR(100) NOT NULL,
        part_code VARCHAR(100),
        unit_name VARCHAR(255),
        part_group VARCHAR(255),
        part_family VARCHAR(255),
        unit_version VARCHAR(100),
        serial_number VARCHAR(100),
        fault_description TEXT,
        owner_type VARCHAR(50),
        owner_name VARCHAR(255),
        rd_owner_name VARCHAR(255),
        created_by VARCHAR(255),
        priority VARCHAR(50) DEFAULT 'No Priority',
        rc_analysis_steps VARCHAR(50) DEFAULT 'Tracking',
        feedback_to_rd TEXT,
        rd_instructions_feedback_to_rc TEXT,
        component_replaced VARCHAR(255),
        final_summary TEXT,
        pronto_rca_analysis_status VARCHAR(50) DEFAULT 'Tracking',
        normal_repair_status VARCHAR(50) DEFAULT 'Visual Check',
        rca_end_date DATE,
        closed_date DATE,
        additional_remarks TEXT,
        status VARCHAR(50) DEFAULT 'Open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS part_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        part_code VARCHAR(100) NOT NULL UNIQUE,
        unit_name VARCHAR(255),
        part_group VARCHAR(255),
        part_family VARCHAR(255)
    )`,
    `CREATE TABLE IF NOT EXISTS rd_owners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255)
    )`,
    `CREATE TABLE IF NOT EXISTS rc_owners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255)
    )`
];

// Columns that older versions of the database may not have yet.
const TICKET_EXTRA_COLUMNS = [
    ["priority", "priority VARCHAR(50) DEFAULT 'No Priority'"],
    ["rc_analysis_steps", "rc_analysis_steps VARCHAR(50) DEFAULT 'Tracking'"],
    ["feedback_to_rd", "feedback_to_rd TEXT"],
    ["rd_instructions_feedback_to_rc", "rd_instructions_feedback_to_rc TEXT"],
    ["component_replaced", "component_replaced VARCHAR(255)"],
    ["final_summary", "final_summary TEXT"],
    ["pronto_rca_analysis_status", "pronto_rca_analysis_status VARCHAR(50) DEFAULT 'Tracking'"],
    ["normal_repair_status", "normal_repair_status VARCHAR(50) DEFAULT 'Visual Check'"],
    ["rca_end_date", "rca_end_date DATE"],
    ["closed_date", "closed_date DATE"],
    ["additional_remarks", "additional_remarks TEXT"],
    ["rd_owner_name", "rd_owner_name VARCHAR(255)"]
];

async function tableExists(table) {
    const [rows] = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
        [DB_NAME, table]
    );
    return rows.length > 0;
}

async function initDatabase() {
    // 1) make sure the database itself exists
    const bootstrap = await mysql.createConnection(DB_CONFIG);
    await bootstrap.query(
        `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await bootstrap.end();

    // 2) a connection pool (reconnects by itself if MySQL restarts)
    pool = mysql.createPool({
        ...DB_CONFIG,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        // Return DATE columns as plain "YYYY-MM-DD" text. Without this, JS turns them
        // into Date objects and the day can shift by one in some timezones (e.g. India).
        dateStrings: ["DATE"]
    });

    // 3) tables
    const partCodesWereMissing = !(await tableExists("part_codes"));
    for (const sql of CREATE_TABLES) await pool.query(sql);

    for (const [column, ddl] of TICKET_EXTRA_COLUMNS) {
        const [rows] = await pool.query("SHOW COLUMNS FROM tickets LIKE ?", [column]);
        if (rows.length === 0) await pool.query(`ALTER TABLE tickets ADD COLUMN ${ddl}`);
    }

    // 4) starter Part Codes - only the very first time, so deleted ones don't come back
    if (partCodesWereMissing) {
        await pool.query(
            "INSERT INTO part_codes (part_code, unit_name, part_group, part_family) VALUES ?",
            [[
                ["PC1001", "Base Station Unit A", "RF Module", "Macro Family"],
                ["PC1002", "Base Station Unit B", "Power Module", "Macro Family"],
                ["PC1003", "Small Cell Unit C", "Antenna Module", "Small Cell Family"]
            ]]
        );
    }
}

function explainDbError(err) {
    console.error("\n[X] Could not start: the database setup failed.");
    console.error(`    ${err.code || ""} ${err.message}\n`);

    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
        console.error(`    MySQL is not reachable at ${DB_CONFIG.host}:${DB_CONFIG.port}.`);
        console.error("    -> Start the MySQL service (Windows: Services -> MySQL80 -> Start,");
        console.error("       or MySQL Workbench / XAMPP control panel), then run again.");
    } else if (err.code === "ER_ACCESS_DENIED_ERROR") {
        console.error(`    MySQL rejected the login for user "${DB_CONFIG.user}".`);
        console.error("    -> Open the .env file and fix DB_USER / DB_PASSWORD.");
    } else if (err.code === "ER_NOT_SUPPORTED_AUTH_MODE" || err.code === "ER_AUTH_PLUGIN_ERR") {
        console.error("    -> Your MySQL user uses an authentication plugin this driver can't use.");
    }
    console.error("");
}

// ---------- express app ----------
const app = express();
app.use(cors());
app.use(express.json());

// Only the "public" folder is served to the browser - server.js, .env and
// package.json are NOT reachable from the web any more.
app.use(express.static(path.join(__dirname, "public")));
// Chart.js is served from node_modules, so the dashboard also works offline.
app.use("/vendor/chartjs", express.static(path.join(__dirname, "node_modules", "chart.js", "dist")));

// every route with ":id" must get a number
app.param("id", (req, res, next, value) => {
    if (!/^\d+$/.test(value)) return res.status(400).json({ error: "Invalid id." });
    next();
});

app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
});

// =============================================================
// TICKETS
// =============================================================

// Create
app.post("/api/tickets", async (req, res) => {
    const body = req.body || {};
    const data = {};

    for (const field of TICKET_FIELDS) {
        const value = readField(body, field);
        data[field.col] = value === undefined ? null : value;
    }
    for (const [col, fallback] of Object.entries(TICKET_DEFAULTS)) {
        if (!data[col]) data[col] = fallback;
    }

    if (!data.pronto_no) throw new HttpError(400, "Pronto Number is required.");
    await assertProntoNoIsFree(data.pronto_no);

    // an RCA end date means the ticket is finished
    const isClosed = Boolean(data.rca_end_date);
    data.status = isClosed ? "Closed" : "Open";
    data.closed_date = isClosed ? data.rca_end_date : null;
    data.created_by = clean(body.createdBy);

    const columns = Object.keys(data);
    const [result] = await pool.query(
        `INSERT INTO tickets (${columns.map((c) => mysql.escapeId(c)).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        columns.map((c) => data[c])
    );
    res.status(201).json({ message: "Ticket created", id: result.insertId });
});

// Open tickets (dashboard + View/Edit page)
app.get("/api/tickets", async (req, res) => {
    const [rows] = await pool.query(
        "SELECT * FROM tickets WHERE LOWER(status) <> 'closed' ORDER BY created_at DESC, id DESC"
    );
    res.json(rows);
});

// Closed tickets
app.get("/api/tickets/closed", async (req, res) => {
    const [rows] = await pool.query(
        "SELECT * FROM tickets WHERE LOWER(status) = 'closed' ORDER BY closed_date DESC, id DESC"
    );
    res.json(rows);
});

// Latest tickets of any status (dashboard "Recent Tickets")
app.get("/api/tickets/recent", async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);
    const [rows] = await pool.query("SELECT * FROM tickets ORDER BY created_at DESC, id DESC LIMIT ?", [limit]);
    res.json(rows);
});

// One ticket
app.get("/api/tickets/:id", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM tickets WHERE id = ?", [req.params.id]);
    if (rows.length === 0) throw new HttpError(404, "Ticket not found.");
    res.json(rows[0]);
});

// Update. Only the fields that are sent get changed - fields that are
// left out keep their current value (they are no longer wiped to NULL).
app.put("/api/tickets/:id", async (req, res) => {
    const body = req.body || {};
    const id = Number(req.params.id);

    const [rows] = await pool.query("SELECT * FROM tickets WHERE id = ?", [id]);
    if (rows.length === 0) throw new HttpError(404, "Ticket not found.");
    const existing = rows[0];

    if (isClosedStatus(existing.status) && !isAdminRequest(req)) {
        throw new HttpError(403, "Only admins can edit a closed ticket.");
    }

    const changes = {};
    for (const field of TICKET_FIELDS) {
        const value = readField(body, field);
        if (value !== undefined) changes[field.col] = value;
    }

    if ("pronto_no" in changes && !changes.pronto_no) throw new HttpError(400, "Pronto Number is required.");
    if ("priority" in changes && !changes.priority) throw new HttpError(400, "Priority is required.");
    for (const [col, fallback] of Object.entries(TICKET_DEFAULTS)) {
        if (col in changes && !changes[col]) changes[col] = fallback;
    }

    if (changes.pronto_no && changes.pronto_no.toLowerCase() !== String(existing.pronto_no || "").toLowerCase()) {
        await assertProntoNoIsFree(changes.pronto_no, id);
    }

    // status follows the RCA end date (or an explicit "Closed")
    const rcaEndDate = "rca_end_date" in changes ? changes.rca_end_date : existing.rca_end_date;
    const requested = clean(body.status) ? normalizeStatus(body.status) : normalizeStatus(existing.status);
    const status = rcaEndDate || isClosedStatus(requested) ? "Closed" : requested;
    changes.status = status;
    changes.closed_date = status === "Closed" ? rcaEndDate || existing.closed_date || todayString() : null;

    const columns = Object.keys(changes);
    await pool.query(
        `UPDATE tickets SET ${columns.map((c) => `${mysql.escapeId(c)} = ?`).join(", ")} WHERE id = ?`,
        [...columns.map((c) => changes[c]), id]
    );
    res.json({ message: "Ticket updated" });
});

// Close shortcut
app.put("/api/tickets/:id/close", async (req, res) => {
    const today = todayString();
    const [result] = await pool.query(
        "UPDATE tickets SET status = 'Closed', closed_date = ?, rca_end_date = COALESCE(rca_end_date, ?) WHERE id = ?",
        [today, today, req.params.id]
    );
    if (result.affectedRows === 0) throw new HttpError(404, "Ticket not found.");
    res.json({ message: "Ticket closed" });
});

// Delete
app.delete("/api/tickets/:id", async (req, res) => {
    const [result] = await pool.query("DELETE FROM tickets WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) throw new HttpError(404, "Ticket not found.");
    res.json({ message: "Ticket deleted" });
});

// =============================================================
// PART CODES (Data Master)
// =============================================================

app.get("/api/part-codes", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM part_codes ORDER BY part_code ASC");
    res.json(rows);
});

app.get("/api/part-codes/:code", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM part_codes WHERE part_code = ?", [req.params.code]);
    if (rows.length === 0) throw new HttpError(404, "Part code not found.");
    res.json(rows[0]);
});

app.post("/api/part-codes", async (req, res) => {
    const body = req.body || {};
    const partCode = clean(body.partCode);
    if (!partCode) throw new HttpError(400, "Part Code is required.");

    try {
        const [result] = await pool.query(
            "INSERT INTO part_codes (part_code, unit_name, part_group, part_family) VALUES (?, ?, ?, ?)",
            [partCode, clean(body.unitName), clean(body.partGroup), clean(body.partFamily)]
        );
        res.status(201).json({ message: "Part code created", id: result.insertId });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") throw new HttpError(409, `Part code "${partCode}" already exists.`);
        throw err;
    }
});

app.delete("/api/part-codes/:id", async (req, res) => {
    const [result] = await pool.query("DELETE FROM part_codes WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) throw new HttpError(404, "Part code not found.");
    res.json({ message: "Part code deleted" });
});

// =============================================================
// R&D OWNERS and RC OWNERS (Data Master) - same logic, two tables
// =============================================================

function registerOwnerRoutes(route, table, label) {
    app.get(`/api/${route}`, async (req, res) => {
        const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY name ASC`);
        res.json(rows);
    });

    app.post(`/api/${route}`, async (req, res) => {
        const body = req.body || {};
        const name = clean(body.name);
        if (!name) throw new HttpError(400, "Name is required.");

        const [result] = await pool.query(`INSERT INTO ${table} (name, email) VALUES (?, ?)`, [name, clean(body.email)]);
        res.status(201).json({ message: `${label} created`, id: result.insertId });
    });

    app.delete(`/api/${route}/:id`, async (req, res) => {
        const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
        if (result.affectedRows === 0) throw new HttpError(404, `${label} not found.`);
        res.json({ message: `${label} deleted` });
    });
}

registerOwnerRoutes("rd-owners", "rd_owners", "R&D owner");
registerOwnerRoutes("rc-owners", "rc_owners", "RC owner");

// =============================================================
// DASHBOARD
// =============================================================

app.get("/api/dashboard/summary", async (req, res) => {
    const [rows] = await pool.query(
        `SELECT
            COUNT(*) AS total,
            COALESCE(SUM(LOWER(status) <> 'closed'), 0) AS open_count,
            COALESCE(SUM(LOWER(status) = 'in progress'), 0) AS in_progress_count,
            COALESCE(SUM(LOWER(status) = 'closed'), 0) AS closed_count
         FROM tickets`
    );
    const r = rows[0];
    res.json({
        total: Number(r.total),
        open_count: Number(r.open_count),
        in_progress_count: Number(r.in_progress_count),
        closed_count: Number(r.closed_count)
    });
});

app.get("/api/dashboard/status-summary", async (req, res) => {
    const [rows] = await pool.query(
        `SELECT
            COALESCE(SUM(LOWER(status) IN ('open', 'opened')), 0) AS opened,
            COALESCE(SUM(LOWER(status) = 'in progress'), 0) AS in_progress,
            COALESCE(SUM(LOWER(status) = 'closed'), 0) AS closed,
            COUNT(*) AS total
         FROM tickets`
    );
    const r = rows[0];
    res.json({
        opened: Number(r.opened),
        in_progress: Number(r.in_progress),
        closed: Number(r.closed),
        total: Number(r.total)
    });
});

app.get("/api/dashboard/monthly-status-summary", async (req, res) => {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = req.query.month && req.query.month !== "all" ? parseInt(req.query.month, 10) : null;
    if (month !== null && !(month >= 1 && month <= 12)) throw new HttpError(400, "Invalid month.");

    const params = [year];
    let where = "WHERE YEAR(created_at) = ?";
    if (month !== null) {
        where += " AND MONTH(created_at) = ?";
        params.push(month);
    }

    const [rows] = await pool.query(
        `SELECT
            MONTH(created_at) AS month_num,
            COALESCE(SUM(LOWER(status) IN ('open', 'opened')), 0) AS opened,
            COALESCE(SUM(LOWER(status) = 'in progress'), 0) AS in_progress,
            COALESCE(SUM(LOWER(status) = 'closed'), 0) AS closed
         FROM tickets
         ${where}
         GROUP BY MONTH(created_at)
         ORDER BY MONTH(created_at)`,
        params
    );

    const months = Array.from({ length: 12 }, (_, index) => {
        const found = rows.find((row) => Number(row.month_num) === index + 1);
        const opened = Number(found?.opened || 0);
        const inProgress = Number(found?.in_progress || 0);
        const closed = Number(found?.closed || 0);
        return {
            month_num: index + 1,
            month_label: new Date(2000, index, 1).toLocaleString("en-US", { month: "short" }),
            opened,
            in_progress: inProgress,
            closed,
            total: opened + inProgress + closed
        };
    });

    res.json(month !== null ? months.filter((item) => item.month_num === month) : months);
});

// ---------- 404 + error handling ----------
app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found." });
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON in request body." });
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That record already exists." });

    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: "Something went wrong on the server. Check the terminal for details." });
});

// ---------- start ----------
async function start() {
    try {
        await initDatabase();
    } catch (err) {
        explainDbError(err);
        process.exit(1);
    }

    const server = app.listen(PORT, () => {
        console.log("MySQL connected, database ready.");
        console.log(`Pronto running at http://localhost:${PORT}`);
    });

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`\n[X] Port ${PORT} is already in use (is another copy of the server still running?).`);
            console.error("    -> Close the other terminal, or set a different PORT in the .env file.\n");
        } else {
            console.error(err);
        }
        process.exit(1);
    });

    const shutdown = async () => {
        server.close();
        await pool.end().catch(() => {});
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

start();
