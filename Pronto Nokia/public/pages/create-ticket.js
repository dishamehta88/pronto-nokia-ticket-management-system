// create-ticket.js - the "Create Ticket" form.

const form = document.getElementById("ticketForm");
const partCodeSelect = document.getElementById("partCode");
const statusEl = document.getElementById("statusMessage");
const submitBtn = document.getElementById("submitBtn");

let partCodes = [];

function setDefaults() {
    document.getElementById("intimateDate").value = Pronto.todayString();
}

// ---- dropdown + suggestions come from the Data Master pages ----
async function loadPartCodes() {
    try {
        partCodes = await Pronto.api("/api/part-codes");
        partCodeSelect.innerHTML = partCodes.length
            ? `<option value="">Select Part Code</option>` +
              partCodes.map((p) => `<option value="${Pronto.escapeHtml(p.part_code)}">${Pronto.escapeHtml(p.part_code)}</option>`).join("")
            : `<option value="">No part codes - add one in Data Master</option>`;
    } catch (err) {
        partCodeSelect.innerHTML = `<option value="">Could not load part codes</option>`;
        Pronto.setMessage(statusEl, err.message, false);
    }
}

async function loadOwnerSuggestions(endpoint, listId) {
    try {
        const owners = await Pronto.api(`/api/${endpoint}`);
        document.getElementById(listId).innerHTML = owners
            .map((o) => `<option value="${Pronto.escapeHtml(o.name)}"></option>`).join("");
    } catch (err) {
        console.warn(`[create-ticket] could not load ${endpoint}:`, err.message);
    }
}

// choosing a part code fills Unit Name / Part Group / Part Family
partCodeSelect.addEventListener("change", function () {
    const part = partCodes.find((p) => p.part_code === this.value);
    document.getElementById("unitName").value = part?.unit_name || "";
    document.getElementById("partGroup").value = part?.part_group || "";
    document.getElementById("partFamily").value = part?.part_family || "";
});

form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const value = (id) => document.getElementById(id).value.trim();

    const required = [
        ["intimateDate", "Received Date"],
        ["country", "Country"],
        ["prontoNo", "Pronto Number"],
        ["partCode", "Unit Part Code"],
        ["unitVersion", "Unit Version"],
        ["serialNumber", "Unit Serial Number"],
        ["faultDescription", "Field Fault Description"],
        ["rcOwnerName", "RC Owner"],
        ["rdOwnerName", "R&D Owner"]
    ];
    const missing = required.find(([id]) => !value(id));
    if (missing) {
        Pronto.setMessage(statusEl, `${missing[1]} is required.`, false);
        document.getElementById(missing[0]).focus();
        return;
    }

    const payload = {
        intimateDate: value("intimateDate"),
        country: value("country"),
        prontoNo: value("prontoNo"),
        partCode: value("partCode"),
        unitName: value("unitName"),
        partGroup: value("partGroup"),
        partFamily: value("partFamily"),
        unitVersion: value("unitVersion"),
        serialNumber: value("serialNumber"),
        faultDescription: value("faultDescription"),
        ownerType: "RC Owner",
        ownerName: value("rcOwnerName"),
        rdOwnerName: value("rdOwnerName"),
        createdBy: Pronto.user || "unknown"
    };

    submitBtn.disabled = true;
    try {
        const data = await Pronto.api("/api/tickets", { method: "POST", body: payload });
        Pronto.setMessage(statusEl, `Ticket created successfully! Ticket ID: ${data.id}`, true);
        form.reset();
        setDefaults();
    } catch (err) {
        Pronto.setMessage(statusEl, err.message, false);
    } finally {
        submitBtn.disabled = false;
    }
});

setDefaults();
loadPartCodes();
loadOwnerSuggestions("rc-owners", "rcOwnerList");
loadOwnerSuggestions("rd-owners", "rdOwnerList");
