// closed-ticket.js - lists every ticket whose status is Closed.

async function loadClosedTickets() {
    const body = document.getElementById("closedTicketsBody");

    try {
        const tickets = await Pronto.api("/api/tickets/closed");

        if (!tickets.length) {
            body.innerHTML = `<tr><td colspan="6" class="empty-state">No closed tickets yet.</td></tr>`;
            return;
        }

        body.innerHTML = tickets.map((t) => `
            <tr>
                <td>${Pronto.escapeHtml(t.pronto_no || "-")}</td>
                <td>${Pronto.escapeHtml(t.country || "-")}</td>
                <td>${Pronto.escapeHtml(t.part_code || "-")}</td>
                <td>${Pronto.escapeHtml(t.owner_name || "-")}</td>
                <td>${Pronto.formatDate(t.intimate_date)}</td>
                <td>${Pronto.formatDate(t.closed_date || t.rca_end_date)}</td>
            </tr>`).join("");
    } catch (err) {
        console.error("[closed-ticket]", err);
        body.innerHTML = `<tr><td colspan="6" class="empty-state">${Pronto.escapeHtml(err.message)}</td></tr>`;
    }
}

loadClosedTickets();
