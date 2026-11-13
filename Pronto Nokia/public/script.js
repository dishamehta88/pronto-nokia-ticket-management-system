/* =============================================================
   script.js - shared by every page except login.html
   - login guard
   - the navbar (written ONCE here instead of copied into 9 pages)
   - small helpers used by the page scripts (Pronto.api, Pronto.escapeHtml ...)
   ============================================================= */

const Pronto = (() => {
    const ADMIN_EMAIL = "admin@pronto.com";
    const user = localStorage.getItem("loggedInUser");

    const isAdmin = () => (user || "").toLowerCase() === ADMIN_EMAIL;

    // Always escape text coming from the database before putting it in innerHTML
    function escapeHtml(value) {
        const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return String(value ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
    }

    // "2026-07-06" -> "06 Jul 2026" (no Date object, so no timezone surprises)
    function formatDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
        if (!match) return "-";
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${match[3]} ${months[Number(match[2]) - 1]} ${match[1]}`;
    }

    // "2026-07-06T00:00:00.000Z" or "2026-07-06" -> "2026-07-06" (for <input type="date">)
    const toInputDate = (value) => (value ? String(value).slice(0, 10) : "");

    function todayString() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    // fetch() wrapper: sends/reads JSON, throws an Error with a readable message
    async function api(url, { method = "GET", body, headers = {} } = {}) {
        const options = { method, headers: { "x-user-role": isAdmin() ? "admin" : "user", ...headers } };
        if (body !== undefined) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        let res;
        try {
            res = await fetch(url, options);
        } catch (err) {
            const error = new Error("Could not reach the server. Is it running? (npm start)");
            error.network = true;
            throw error;
        }

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const error = new Error((data && data.error) || `Request failed (${res.status}).`);
            error.status = res.status;
            throw error;
        }
        return data;
    }

    function setMessage(el, text, ok) {
        if (!el) return;
        el.style.color = ok ? "#16a34a" : "#d32f2f";
        el.textContent = text;
    }

    function renderNavbar() {
        const host = document.getElementById("navbar");
        if (!host) return;

        const here = location.pathname;
        const cls = (href) => (here === href ? " active" : "");
        const groupCls = (hrefs) => (hrefs.includes(here) ? " active" : "");
        const tickets = ["/pages/create-ticket.html", "/pages/edit-ticket.html", "/pages/closed-ticket.html"];
        const master = ["/pages/part-code.html", "/pages/rd-owner.html", "/pages/rc-owner.html"];

        host.innerHTML = `
        <nav class="navbar">
            <a class="logo" href="/" title="Home">
                <img src="/assets/nokia-logo.png" alt="Nokia" class="logo-img">
            </a>

            <div class="nav-menu">
                <a href="/pages/dashboard.html" class="nav-item${cls("/pages/dashboard.html")}">📊 Dashboard</a>

                <div class="nav-dropdown">
                    <button type="button" class="nav-item${groupCls(tickets)}">🎫 Tickets</button>
                    <div class="dropdown-content">
                        <a href="/pages/create-ticket.html">Create Ticket</a>
                        <a href="/pages/edit-ticket.html">View / Edit Ticket</a>
                        <a href="/pages/closed-ticket.html">Closed Tickets</a>
                    </div>
                </div>

                <div class="nav-dropdown">
                    <button type="button" class="nav-item${groupCls(master)}">🗄️ Data Master</button>
                    <div class="dropdown-content">
                        <a href="/pages/part-code.html">Part Code</a>
                        <a href="/pages/rd-owner.html">R&amp;D Owner</a>
                        <a href="/pages/rc-owner.html">RC Owner</a>
                    </div>
                </div>
            </div>

            <div class="profile-container">
                <button type="button" class="profile-btn">👤 User Profile</button>
                <div class="profile-menu">
                    <div class="user-info">
                        <span class="label">Logged In As</span>
                        <span class="value" id="userEmail">${escapeHtml(user)}</span>
                    </div>
                    <a href="#" id="logoutBtn" class="logout-btn">Logout</a>
                </div>
            </div>
        </nav>`;

        const profileBtn = host.querySelector(".profile-btn");
        const profileMenu = host.querySelector(".profile-menu");

        profileBtn.addEventListener("click", () => profileMenu.classList.toggle("show"));
        window.addEventListener("click", (e) => {
            if (!profileBtn.contains(e.target) && !profileMenu.contains(e.target)) {
                profileMenu.classList.remove("show");
            }
        });

        host.querySelector("#logoutBtn").addEventListener("click", (e) => {
            e.preventDefault();
            localStorage.removeItem("loggedInUser");
            location.href = "/login.html";
        });
    }

    return { user, isAdmin, escapeHtml, formatDate, toInputDate, todayString, api, setMessage, renderNavbar };
})();

if (!Pronto.user) {
    location.replace("/login.html");
} else {
    Pronto.renderNavbar();
}
