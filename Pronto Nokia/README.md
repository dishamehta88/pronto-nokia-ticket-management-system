# Pronto - Root Cause Analysis Management System

Node.js + Express + MySQL backend, plain HTML/CSS/JS frontend.

## Run it (VS Code)

1. Install **Node.js 18+** and **MySQL** (make sure the MySQL service is running).
2. Open this folder in VS Code (`File -> Open Folder`).
3. Open `.env` and set `DB_PASSWORD` to *your* MySQL root password.
4. In the VS Code terminal (`Ctrl + ~`):
   ```
   npm install
   npm start
   ```
   (`npm install` is only needed if the `node_modules` folder is missing.)
5. Open **http://localhost:3000** - or just press **F5** in VS Code, it starts the server *and* opens the browser.

The database (`pronto_db`) and all tables are created automatically on the first start.
Use `npm run dev` if you want the server to restart itself when you edit `server.js`.

### Demo logins
| Email | Password | Role |
|---|---|---|
| admin@pronto.com | Admin123 | Admin (can edit closed tickets) |
| shubham@pronto.com | shubham123 | User |
| tl@pronto.com | tl123 | User |
| disha@pronto.com | disha123 | User |

## Folder layout
```
server.js            backend: API + database setup
.env                 your settings (MySQL password, port) - not for git
public/              everything the browser can see
  index.html, login.html, script.js (shared navbar + helpers), style.css
  pages/             dashboard, tickets, data-master pages + their JS
setup_database.sql   optional manual DB setup (server does it automatically)
```
Only `public/` is served to the browser, so `server.js` and `.env` can't be downloaded.

## Troubleshooting
| Message in terminal | Fix |
|---|---|
| `ECONNREFUSED ... 3306` | MySQL isn't running. Start the MySQL service. |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `.env`. |
| `Port 3000 is already in use` | Close the other terminal running the server, or change `PORT` in `.env`. |
| Page says "Could not reach the server" | The server isn't running - `npm start`. |
| Charts empty / `Chart is not defined` | Run `npm install` (Chart.js is served from `node_modules`). |

## Known limitations (good next steps)
- **Login is front-end only.** The demo users/passwords are in `public/login.js` and the "admin" check
  is sent by the browser, so anyone technical can bypass it. Fine for a demo/internal prototype; for real
  use, add server-side login (sessions or JWT, hashed passwords) and check the role on the server.
- Create Ticket stores the RC Owner as the main owner (`owner_name`) and the R&D Owner in `rd_owner_name`.

## API (all JSON)
`GET/POST /api/tickets`, `GET /api/tickets/closed|recent|:id`, `PUT|DELETE /api/tickets/:id`, `PUT /api/tickets/:id/close`,
`GET/POST/DELETE /api/part-codes`, `/api/rc-owners`, `/api/rd-owners`, `GET /api/dashboard/summary|status-summary|monthly-status-summary`, `GET /api/health`.
