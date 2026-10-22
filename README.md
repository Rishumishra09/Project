# HelpDesk — IT Support Ticket Management System

A beginner-friendly helpdesk prototype built with HTML, CSS, JavaScript, Node.js, Express, Express Session, and SQLite.

## Features
- Employee registration and login
- Admin and employee roles
- Employees create tickets and see only their own tickets
- Admin views all tickets, changes priority/status, and deletes tickets
- Ticket records persist in a local SQLite database
- Automatically imports existing `data/users.json` and `data/tickets.json` into SQLite on first run if the database is empty

## Run locally
1. Install Node.js (LTS).
2. Open this folder in a terminal.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Demo accounts
- Admin: `admin@helpdesk.demo` / `Admin123!`
- Employee: `user@helpdesk.demo` / `User123!`
- Second employee: `employee@helpdesk.demo` / `User123!`

## Where data is stored
The SQLite database is created at `data/helpdesk.sqlite`. It contains `users` and `tickets` tables. Existing JSON data, if present when the database is first initialized, is imported once. After that, the application reads and writes to SQLite, not JSON.

## Main API routes
- `POST /api/register` — create employee account
- `POST /api/login` / `POST /api/logout` — session login/logout
- `GET /api/me` — current session
- `GET /api/tickets` — tickets visible to the logged-in role
- `POST /api/tickets` — create ticket
- `PATCH /api/tickets/:id` — admin updates status/priority
- `DELETE /api/tickets/:id` — admin deletes ticket

## Demo limitations
This is a learning prototype, not production-ready. For a real deployment, hash passwords (for example with bcrypt), use a strong environment-provided session secret, configure secure cookies/HTTPS, and add production session storage and validation. SQLite is suitable for a small local prototype; a larger concurrent deployment may use PostgreSQL.
