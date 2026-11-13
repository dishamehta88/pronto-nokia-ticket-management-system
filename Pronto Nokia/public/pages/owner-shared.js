// owner-shared.js - used by BOTH rd-owner.html and rc-owner.html.
// The page tells us which API to use through <script data-endpoint="rd-owners|rc-owners">.

const API = "/api/" + document.currentScript.getAttribute("data-endpoint");

async function loadOwners() {
    const body = document.getElementById("listBody");

    try {
        const rows = await Pronto.api(API);

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="3" class="empty-state">No owners yet. Add one above.</td></tr>`;
            return;
        }

        body.innerHTML = rows.map((r) => `
            <tr>
                <td>${Pronto.escapeHtml(r.name)}</td>
                <td>${Pronto.escapeHtml(r.email || "-")}</td>
                <td><button type="button" class="icon-btn danger" title="Delete" onclick="deleteOwner(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
            </tr>`).join("");
    } catch (err) {
        console.error("[owner]", err);
        body.innerHTML = `<tr><td colspan="3" class="empty-state">${Pronto.escapeHtml(err.message)}</td></tr>`;
    }
}

async function deleteOwner(id) {
    if (!confirm("Delete this owner?")) return;

    try {
        await Pronto.api(`${API}/${id}`, { method: "DELETE" });
        loadOwners();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById("addForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const statusEl = document.getElementById("statusMessage");

    const payload = {
        name: document.getElementById("ownerName").value.trim(),
        email: document.getElementById("ownerEmail").value.trim()
    };

    if (!payload.name) {
        Pronto.setMessage(statusEl, "Name is required.", false);
        return;
    }

    try {
        await Pronto.api(API, { method: "POST", body: payload });
        Pronto.setMessage(statusEl, "Owner added!", true);
        this.reset();
        loadOwners();
    } catch (err) {
        Pronto.setMessage(statusEl, err.message, false);
    }
});

loadOwners();
