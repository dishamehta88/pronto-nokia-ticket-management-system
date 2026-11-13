// edit-ticket.js - lists open tickets; edit them (or delete) in a popup.

const API = "/api/tickets";
const el = (id) => document.getElementById(id);

let partCodes = [];
let rcOwners = [];
let rdOwners = [];

const EDITABLE_FIELDS = [
    "editPriority", "editRcAnalysisSteps", "editIntimateDate", "editCountry",
    "editPartCode", "editUnitName", "editPartGroup", "editPartFamily",
    "editUnitVersion", "editSerialNumber", "editFaultDescription",
    "editOwnerType", "editOwnerName", "editRdOwnerName",
    "editFeedbackToRd", "editRdInstructionsFeedbackToRc", "editComponentReplaced",
    "editProntoRcaAnalysisStatus", "editFinalSummary", "editNormalRepairStatus",
    "editRcaEndDate", "editAdditionalRemarks"
];

function setFormReadonly(readOnly) {
    EDITABLE_FIELDS.forEach((id) => { el(id).disabled = readOnly; });
    document.querySelector("#editForm .btn").disabled = readOnly;
}

function updateStatusBadge(status) {
    const badge = el("modalStatus");
    badge.textContent = status || "Open";
    badge.style.color = status === "Closed" ? "#b91c1c" : "#0b3c88";
}

// ---------- master data used by the form ----------
async function loadMasterData() {
    const [codes, rc, rd] = await Promise.allSettled([
        Pronto.api("/api/part-codes"),
        Pronto.api("/api/rc-owners"),
        Pronto.api("/api/rd-owners")
    ]);
    partCodes = codes.status === "fulfilled" ? codes.value : [];
    rcOwners = rc.status === "fulfilled" ? rc.value : [];
    rdOwners = rd.status === "fulfilled" ? rd.value : [];

    el("rdOwnerSuggestions").innerHTML = rdOwners.map((o) => `<option value="${Pronto.escapeHtml(o.name)}"></option>`).join("");
    refreshOwnerSuggestions();
}

function refreshOwnerSuggestions() {
    const list = el("editOwnerType").value === "R&D Owner" ? rdOwners : rcOwners;
    el("ownerSuggestions").innerHTML = list.map((o) => `<option value="${Pronto.escapeHtml(o.name)}"></option>`).join("");
}

// fill the Part Code dropdown; keep the ticket's own code even if it was deleted from the master list
function fillPartCodeSelect(current) {
    const codes = partCodes.map((p) => p.part_code);
    if (current && !codes.includes(current)) codes.unshift(current);

    el("editPartCode").innerHTML = `<option value="">Select Part Code</option>` +
        codes.map((c) => `<option value="${Pronto.escapeHtml(c)}">${Pronto.escapeHtml(c)}</option>`).join("");
    el("editPartCode").value = current || "";
}

el("editPartCode").addEventListener("change", function () {
    const part = partCodes.find((p) => p.part_code === this.value);
    if (!part) return;
    el("editUnitName").value = part.unit_name || "";
    el("editPartGroup").value = part.part_group || "";
    el("editPartFamily").value = part.part_family || "";
});

el("editOwnerType").addEventListener("change", refreshOwnerSuggestions);

// ---------- table ----------
async function loadTickets() {
    const body = el("ticketsBody");

    try {
        const tickets = await Pronto.api(API);

        if (!tickets.length) {
            body.innerHTML = `<tr><td colspan="6" class="empty-state">No open tickets. Create one from the Tickets menu.</td></tr>`;
            return;
        }

        body.innerHTML = tickets.map((t) => `
            <tr>
                <td>${Pronto.escapeHtml(t.pronto_no || "-")}</td>
                <td>${Pronto.escapeHtml(t.country || "-")}</td>
                <td>${Pronto.escapeHtml(t.part_code || "-")}</td>
                <td>${Pronto.escapeHtml(t.owner_name || "-")}</td>
                <td><span class="status-badge ${t.status === "Closed" ? "status-closed" : "status-open"}">${Pronto.escapeHtml(t.status || "Open")}</span></td>
                <td>
                    <button type="button" class="icon-btn" title="Edit" onclick="openEditModal(${t.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
                    <button type="button" class="icon-btn danger" title="Delete" onclick="deleteTicket(${t.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
                </td>
            </tr>`).join("");
    } catch (err) {
        console.error("[edit-ticket]", err);
        body.innerHTML = `<tr><td colspan="6" class="empty-state">${Pronto.escapeHtml(err.message)}</td></tr>`;
    }
}

// ---------- modal ----------
async function openEditModal(id) {
    try {
        const t = await Pronto.api(`${API}/${id}`);

        el("editId").value = t.id;
        el("editProntoNo").value = t.pronto_no || "";
        el("editIntimateDate").value = Pronto.toInputDate(t.intimate_date);
        el("editCountry").value = t.country || "";
        fillPartCodeSelect(t.part_code);
        el("editUnitName").value = t.unit_name || "";
        el("editPartGroup").value = t.part_group || "";
        el("editPartFamily").value = t.part_family || "";
        el("editUnitVersion").value = t.unit_version || "";
        el("editSerialNumber").value = t.serial_number || "";
        el("editFaultDescription").value = t.fault_description || "";
        el("editOwnerType").value = t.owner_type || "";
        el("editOwnerName").value = t.owner_name || "";
        el("editRdOwnerName").value = t.rd_owner_name || "";
        el("editPriority").value = t.priority || "No Priority";
        el("editRcAnalysisSteps").value = t.rc_analysis_steps || "Tracking";
        el("editFeedbackToRd").value = t.feedback_to_rd || "";
        el("editRdInstructionsFeedbackToRc").value = t.rd_instructions_feedback_to_rc || "";
        el("editComponentReplaced").value = t.component_replaced || "";
        el("editFinalSummary").value = t.final_summary || "";
        el("editProntoRcaAnalysisStatus").value = t.pronto_rca_analysis_status || "Tracking";
        el("editNormalRepairStatus").value = t.normal_repair_status || "Visual Check";
        el("editRcaEndDate").value = Pronto.toInputDate(t.rca_end_date);
        el("editAdditionalRemarks").value = t.additional_remarks || "";
        el("modalProntoNo").textContent = t.pronto_no || "-";
        el("modalOwner").textContent = t.owner_name || "-";
        updateStatusBadge(t.status || "Open");
        refreshOwnerSuggestions();

        const readOnly = t.status === "Closed" && !Pronto.isAdmin();
        setFormReadonly(readOnly);
        el("readOnlyBanner").hidden = !readOnly;
        el("readOnlyBanner").textContent = readOnly ? "This ticket is closed. Only admins can edit it further." : "";

        el("statusMessage").textContent = "";
        el("editModal").classList.add("show");
    } catch (err) {
        console.error("[edit-ticket]", err);
        alert(err.message);
    }
}

function closeModal() {
    el("editModal").classList.remove("show");
    el("statusMessage").textContent = "";
}

async function deleteTicket(id) {
    if (!confirm("Delete this ticket? This cannot be undone.")) return;

    try {
        await Pronto.api(`${API}/${id}`, { method: "DELETE" });
        loadTickets();
    } catch (err) {
        alert(err.message);
    }
}

el("closeModalBtn").addEventListener("click", closeModal);
el("cancelModalBtn").addEventListener("click", closeModal);
el("editModal").addEventListener("click", (e) => { if (e.target === el("editModal")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// an RCA end date closes the ticket, clearing it re-opens it
el("editRcaEndDate").addEventListener("change", function () {
    updateStatusBadge(this.value ? "Closed" : "Open");
});

el("editForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const statusEl = el("statusMessage");
    const value = (id) => el(id).value;
    const priority = value("editPriority").trim();

    if (!priority) {
        Pronto.setMessage(statusEl, "Priority is required.", false);
        return;
    }

    const payload = {
        intimateDate: value("editIntimateDate"),
        country: value("editCountry"),
        prontoNo: value("editProntoNo"),
        partCode: value("editPartCode"),
        unitName: value("editUnitName"),
        partGroup: value("editPartGroup"),
        partFamily: value("editPartFamily"),
        unitVersion: value("editUnitVersion"),
        serialNumber: value("editSerialNumber"),
        faultDescription: value("editFaultDescription"),
        ownerType: value("editOwnerType"),
        ownerName: value("editOwnerName"),
        rdOwnerName: value("editRdOwnerName"),
        priority,
        rcAnalysisSteps: value("editRcAnalysisSteps"),
        feedbackToRd: value("editFeedbackToRd"),
        rdInstructionsFeedbackToRc: value("editRdInstructionsFeedbackToRc"),
        componentReplaced: value("editComponentReplaced"),
        finalSummary: value("editFinalSummary"),
        prontoRcaAnalysisStatus: value("editProntoRcaAnalysisStatus"),
        normalRepairStatus: value("editNormalRepairStatus"),
        rcaEndDate: value("editRcaEndDate"),
        additionalRemarks: value("editAdditionalRemarks"),
        status: el("modalStatus").textContent || "Open"
    };

    try {
        await Pronto.api(`${API}/${value("editId")}`, { method: "PUT", body: payload });
        Pronto.setMessage(statusEl, "Saved!", true);
        setTimeout(() => { closeModal(); loadTickets(); }, 600);
    } catch (err) {
        Pronto.setMessage(statusEl, err.message, false);
    }
});

loadMasterData();
loadTickets();
