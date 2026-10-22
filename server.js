
const express = require("express");
const session = require("express-session");
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "helpdesk.sqlite");
const OLD_USERS_FILE = path.join(DATA_DIR, "users.json");
const OLD_TICKETS_FILE = path.join(DATA_DIR, "tickets.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

let db;

// Save the in-memory SQLite database to a real .sqlite file.
function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// Run a SELECT query and return all rows as JavaScript objects.
function queryAll(sql, params = []) {
  const statement = db.prepare(sql);

  try {
    statement.bind(params);
    const rows = [];

    while (statement.step()) {
      rows.push(statement.getAsObject());
    }

    return rows;
  } finally {
    statement.free();
  }
}

// Return one row, or undefined if no row matches.
function queryOne(sql, params = []) {
  return queryAll(sql, params)[0];
}

// Run an INSERT, UPDATE, or DELETE statement.
function execute(sql, params = []) {
  db.run(sql, params);
}

// Create database tables.
function createTables() {
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
        CHECK(role IN ('admin', 'user')),
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      priority TEXT NOT NULL
        CHECK(priority IN ('Low', 'Medium', 'High')),
      status TEXT NOT NULL
        CHECK(status IN ('Open', 'In Progress', 'Resolved')),
      requester TEXT NOT NULL,
      user_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY(user_email) REFERENCES users(email)
    )
  `);
}

// Import existing JSON data or create demo records.
function initializeData() {
  const userCount = queryOne(
    "SELECT COUNT(*) AS count FROM users"
  ).count;

  if (userCount === 0) {
    let users = [];

    if (fs.existsSync(OLD_USERS_FILE)) {
      users = JSON.parse(
        fs.readFileSync(OLD_USERS_FILE, "utf8")
      );
    }

    if (users.length === 0) {
      users = [
        {
          name: "HelpDesk Admin",
          email: "admin@helpdesk.demo",
          password: "Admin123!",
          role: "admin"
        },
        {
          name: "Aarav Sharma",
          email: "user@helpdesk.demo",
          password: "User123!",
          role: "user"
        },
        {
          name: "Demo Employee",
          email: "employee@helpdesk.demo",
          password: "User123!",
          role: "user"
        }
      ];
    }

    users.forEach((user) => {
      execute(
        `INSERT OR IGNORE INTO users
         (name, email, password, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          user.name,
          user.email.toLowerCase(),
          user.password,
          user.role === "admin" ? "admin" : "user",
          new Date().toISOString()
        ]
      );
    });
  }

  const ticketCount = queryOne(
    "SELECT COUNT(*) AS count FROM tickets"
  ).count;

  if (ticketCount === 0) {
    let tickets = [];

    if (fs.existsSync(OLD_TICKETS_FILE)) {
      tickets = JSON.parse(
        fs.readFileSync(OLD_TICKETS_FILE, "utf8")
      );
    }

    if (tickets.length === 0) {
      tickets = [
        {
          id: "TKT-1001",
          title: "Wi-Fi connection is unstable",
          description:
            "The office laptop disconnects from Wi-Fi repeatedly.",
          category: "Network",
          priority: "High",
          status: "Open",
          requester: "Aarav Sharma",
          userEmail: "user@helpdesk.demo",
          createdAt: new Date().toISOString()
        },
        {
          id: "TKT-1002",
          title: "Install spreadsheet software",
          description:
            "Please install the approved spreadsheet application.",
          category: "Software",
          priority: "Medium",
          status: "In Progress",
          requester: "Aarav Sharma",
          userEmail: "user@helpdesk.demo",
          createdAt: new Date(
            Date.now() - 86400000
          ).toISOString()
        },
        {
          id: "TKT-1003",
          title: "Keyboard key is stuck",
          description:
            "The space bar sometimes does not respond.",
          category: "Hardware",
          priority: "Low",
          status: "Resolved",
          requester: "Demo Employee",
          userEmail: "employee@helpdesk.demo",
          createdAt: new Date(
            Date.now() - 172800000
          ).toISOString()
        }
      ];
    }

    tickets.forEach((ticket) => {
      const email = String(
        ticket.userEmail || ticket.user_email || ""
      ).toLowerCase();

      if (!email) return;

      // Ensure the ticket owner exists before importing the ticket.
      const existingUser = queryOne(
        "SELECT email FROM users WHERE email = ?",
        [email]
      );

      if (!existingUser) {
        execute(
          `INSERT INTO users
           (name, email, password, role, created_at)
           VALUES (?, ?, ?, 'user', ?)`,
          [
            ticket.requester || "Demo Employee",
            email,
            "User123!",
            new Date().toISOString()
          ]
        );
      }

      execute(
        `INSERT OR IGNORE INTO tickets
         (id, title, description, category, priority, status,
          requester, user_email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticket.id || `TKT-${Date.now()}`,
          ticket.title || "Untitled ticket",
          ticket.description || "",
          ticket.category || "Other",
          ["Low", "Medium", "High"].includes(ticket.priority)
            ? ticket.priority
            : "Medium",
          ["Open", "In Progress", "Resolved"].includes(ticket.status)
            ? ticket.status
            : "Open",
          ticket.requester || "Demo Employee",
          email,
          ticket.createdAt || ticket.created_at ||
            new Date().toISOString(),
          ticket.updatedAt || ticket.updated_at || null
        ]
      );
    });
  }

  saveDatabase();
}

app.use(express.json());

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "change-this-demo-secret-before-deployment",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false
  })
);

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  if (req.session.user.role !== "admin") {
    return res.status(403).json({
      message: "Only an admin can perform this action."
    });
  }

  next();
}

const priorities = ["Low", "Medium", "High"];
const statuses = ["Open", "In Progress", "Resolved"];
const categories = [
  "Hardware",
  "Software",
  "Network",
  "Account",
  "Other"
];

function toTicket(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    requester: row.requester,
    userEmail: row.user_email,
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {})
  };
}

app.get("/", (req, res) => {
  res.redirect(
    req.session.user ? "/index.html" : "/login.html"
  );
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// Register an employee account.
app.post("/api/register", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");

  if (
    name.length < 2 ||
    !email.includes("@") ||
    password.length < 6
  ) {
    return res.status(400).json({
      message:
        "Enter a name, valid email, and password of at least 6 characters."
    });
  }

  try {
    execute(
      `INSERT INTO users
       (name, email, password, role, created_at)
       VALUES (?, ?, ?, 'user', ?)`,
      [name, email, password, new Date().toISOString()]
    );

    saveDatabase();

    req.session.user = { name, email, role: "user" };

    res.status(201).json({ user: req.session.user });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    console.error("Registration error:", error);
    res.status(500).json({
      message: "Could not register the account."
    });
  }
});

// Login.
app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");

  const user = queryOne(
    `SELECT name, email, password, role
     FROM users WHERE email = ? AND password = ?`,
    [email, password]
  );

  if (!user) {
    return res.status(401).json({
      message: "Email or password is incorrect."
    });
  }

  req.session.user = {
    name: user.name,
    email: user.email,
    role: user.role
  };

  res.json({ user: req.session.user });
});

// Logout.
app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: "Could not log out."
      });
    }

    res.json({ message: "Logged out." });
  });
});

// Admin sees every ticket; employees see only their own tickets.
app.get("/api/tickets", requireLogin, (req, res) => {
  const rows =
    req.session.user.role === "admin"
      ? queryAll(
          "SELECT * FROM tickets ORDER BY created_at DESC"
        )
      : queryAll(
          `SELECT * FROM tickets
           WHERE user_email = ?
           ORDER BY created_at DESC`,
          [req.session.user.email]
        );

  res.json(rows.map(toTicket));
});

// Create a ticket for the logged-in employee.
app.post("/api/tickets", requireLogin, (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const { category, priority } = req.body;

  if (!title) {
    return res.status(400).json({
      message: "Ticket title is required."
    });
  }

  if (
    !categories.includes(category) ||
    !priorities.includes(priority)
  ) {
    return res.status(400).json({
      message: "Choose a valid category and priority."
    });
  }

  const latest = queryOne(
    `SELECT id FROM tickets
     WHERE id LIKE 'TKT-%'
     ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC
     LIMIT 1`
  );

  const previousNumber = latest
    ? Number(latest.id.replace("TKT-", "")) || 1000
    : 1000;

  const ticket = {
    id: `TKT-${previousNumber + 1}`,
    title: title.slice(0, 120),
    description: description.slice(0, 1000),
    category,
    priority,
    status: "Open",
    requester: req.session.user.name,
    user_email: req.session.user.email,
    created_at: new Date().toISOString()
  };

  try {
    execute(
      `INSERT INTO tickets
       (id, title, description, category, priority, status,
        requester, user_email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticket.id,
        ticket.title,
        ticket.description,
        ticket.category,
        ticket.priority,
        ticket.status,
        ticket.requester,
        ticket.user_email,
        ticket.created_at
      ]
    );

    saveDatabase();

    res.status(201).json(toTicket(ticket));
  } catch (error) {
    console.error("Ticket creation error:", error);
    res.status(500).json({
      message: "Could not create the ticket."
    });
  }
});

// Only an admin can update ticket status or priority.
app.patch("/api/tickets/:id", requireAdmin, (req, res) => {
  const { status, priority } = req.body;

  if (status !== undefined && !statuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid status."
    });
  }

  if (
    priority !== undefined &&
    !priorities.includes(priority)
  ) {
    return res.status(400).json({
      message: "Invalid priority."
    });
  }

  const current = queryOne(
    "SELECT * FROM tickets WHERE id = ?",
    [req.params.id]
  );

  if (!current) {
    return res.status(404).json({
      message: "Ticket not found."
    });
  }

  execute(
    `UPDATE tickets
     SET status = ?, priority = ?, updated_at = ?
     WHERE id = ?`,
    [
      status ?? current.status,
      priority ?? current.priority,
      new Date().toISOString(),
      req.params.id
    ]
  );

  saveDatabase();

  res.json(
    toTicket(
      queryOne(
        "SELECT * FROM tickets WHERE id = ?",
        [req.params.id]
      )
    )
  );
});

// Only an admin can delete a ticket.
app.delete("/api/tickets/:id", requireAdmin, (req, res) => {
  const current = queryOne(
    "SELECT id FROM tickets WHERE id = ?",
    [req.params.id]
  );

  if (!current) {
    return res.status(404).json({
      message: "Ticket not found."
    });
  }

  execute("DELETE FROM tickets WHERE id = ?", [
    req.params.id
  ]);

  saveDatabase();

  res.json({ message: "Ticket deleted." });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: "sqlite" });
});

app.get("/index.html", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Initialize SQLite before starting the web server.
async function startServer() {
  try {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_FILE)) {
      const fileBuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    createTables();
    initializeData();

    app.listen(PORT, () => {
      console.log(`HelpDesk running at http://localhost:${PORT}`);
      console.log(`SQLite database: ${DB_FILE}`);
    });
  } catch (error) {
    console.error("Failed to initialize SQLite:", error);
    process.exit(1);
  }
}

startServer();
