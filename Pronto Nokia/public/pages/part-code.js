// part-code.js - add new part codes and list / delete existing ones.

const API = "/api/part-codes";

async function loadPartCodes() {
    const body = document.getElementById("listBody");

    try {
        const rows = await Pronto.api(API);

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="5" class="empty-state">No part codes yet. Add one above.</td></tr>`;
            return;
        }

        body.innerHTML = rows.map((r) => `
            <tr>
                <td>${Pronto.escapeHtml(r.part_code)}</td>
                <td>${Pronto.escapeHtml(r.unit_name || "-")}</td>
                <td>${Pronto.escapeHtml(r.part_group || "-")}</td>
                <td>${Pronto.escapeHtml(r.part_family || "-")}</td>
                <td><button type="button" class="icon-btn danger" title="Delete" onclick="deletePartCode(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
            </tr>`).join("");
    } catch (err) {
        console.error("[part-code]", err);
        body.innerHTML = `<tr><td colspan="5" class="empty-state">${Pronto.escapeHtml(err.message)}</td></tr>`;
    }
}

async function deletePartCode(id) {
    if (!confirm("Delete this part code?")) return;

    try {
        await Pronto.api(`${API}/${id}`, { method: "DELETE" });
        loadPartCodes();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById("addForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const statusEl = document.getElementById("statusMessage");

    const payload = {
        partCode: document.getElementById("partCode").value.trim(),
        unitName: document.getElementById("unitName").value.trim(),
        partGroup: document.getElementById("partGroup").value.trim(),
        partFamily: document.getElementById("partFamily").value.trim()
    };

    if (!payload.partCode) {
        Pronto.setMessage(statusEl, "Part Code is required.", false);
        return;
    }

    try {
        await Pronto.api(API, { method: "POST", body: payload });
        Pronto.setMessage(statusEl, "Part code added!", true);
        this.reset();
        loadPartCodes();
    } catch (err) {
        Pronto.setMessage(statusEl, err.message, false);
    }
});

loadPartCodes();
