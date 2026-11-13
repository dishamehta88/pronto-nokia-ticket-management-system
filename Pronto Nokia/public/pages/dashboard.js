// dashboard.js - summary numbers, two charts and the recent tickets table.

let statusChart;
let barChart;

function setText(id, value) {
    document.getElementById(id).textContent = value;
}

async function loadSummary() {
    try {
        const data = await Pronto.api("/api/dashboard/summary");
        setText("totalCount", data.total || 0);
        setText("openCount", data.open_count || 0);
        setText("closedCount", data.closed_count || 0);
    } catch (err) {
        console.error("[dashboard] summary:", err);
        ["totalCount", "openCount", "closedCount"].forEach((id) => setText(id, "!"));
    }
}

function showEmptyState(canvas, emptyState, message) {
    canvas.style.display = "none";
    emptyState.style.display = "block";
    emptyState.innerText = message;
}

function hideEmptyState(canvas, emptyState) {
    canvas.style.display = "block";
    emptyState.style.display = "none";
}

function createStatusChart(data) {
    const canvas = document.getElementById("statusChart");
    const emptyState = document.getElementById("statusChartEmpty");
    const openCount = Number(data.opened || 0) + Number(data.in_progress || 0);
    const values = [openCount, Number(data.closed || 0)];

    if (values.every((value) => value === 0)) {
        showEmptyState(canvas, emptyState, "No tickets available");
        return;
    }

    hideEmptyState(canvas, emptyState);

    if (statusChart) {
        statusChart.destroy();
    }

    const ctx = canvas.getContext("2d");
    statusChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Open / In Progress", "Closed"],
            datasets: [{
                data: values,
                backgroundColor: ["#3b82f6", "#f59e0b"],
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: "easeOutQuart"
            },
            plugins: {
                legend: {
                    position: "right",
                    labels: {
                        color: "#374151",
                        padding: 16,
                        boxWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = Number(context.raw || 0);
                            const total = values.reduce((sum, item) => sum + item, 0);
                            const percent = total === 0 ? 0 : ((value / total) * 100).toFixed(0);
                            return `${context.label}: ${value} (${percent}%)`;
                        }
                    }
                }
            }
        }
    });
}

function createBarChart(data) {
    const canvas = document.getElementById("barChart");
    const emptyState = document.getElementById("barChartEmpty");
    const labels = data.map((item) => item.month_label);
    const opened = data.map((item) => Number(item.opened || 0));
    const inProgress = data.map((item) => Number(item.in_progress || 0));
    const closed = data.map((item) => Number(item.closed || 0));

    if (!labels.length || (opened.every((value) => value === 0) && inProgress.every((value) => value === 0) && closed.every((value) => value === 0))) {
        showEmptyState(canvas, emptyState, "No tickets available");
        return;
    }

    hideEmptyState(canvas, emptyState);

    if (barChart) {
        barChart.destroy();
    }

    const ctx = canvas.getContext("2d");

    // Determine y-axis maximum so ticks show integer steps (0,1,2,3...)
    const allValues = opened.concat(inProgress, closed);
    const maxValue = allValues.length ? Math.max(...allValues) : 0;
    const suggestedMax = Math.max(7, maxValue);

    barChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                    label: "Opened",
                    data: opened,
                    backgroundColor: "#f59e0b",
                    stack: "stack1"
                },
                {
                    label: "In Progress",
                    data: inProgress,
                    backgroundColor: "#3b82f6",
                    stack: "stack1"
                },
                {
                    label: "Closed",
                    data: closed,
                    backgroundColor: "#10b981",
                    stack: "stack1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: "easeOutQuart"
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: "#374151"
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    suggestedMax: suggestedMax,
                    ticks: {
                        color: "#374151",
                        stepSize: 1,
                        precision: 0
                    },
                    grid: {
                        color: "rgba(0, 0, 0, 0.06)"
                    }
                }
            },
            plugins: {
                legend: {
                    position: "top",
                    labels: {
                        color: "#374151"
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.parsed.y}`,
                        footer: (items) => {
                            const total = items.reduce((sum, item) => sum + Number(item.parsed.y || 0), 0);
                            return `Total: ${total}`;
                        }
                    }
                }
            }
        }
    });
}

async function loadStatusChart() {
    try {
        createStatusChart(await Pronto.api("/api/dashboard/status-summary"));
    } catch (err) {
        console.error("[dashboard] status chart:", err);
        showEmptyState(document.getElementById("statusChart"), document.getElementById("statusChartEmpty"), err.message);
    }
}

async function loadBarChart() {
    const year = document.getElementById("yearSelect").value;
    const month = document.getElementById("monthSelect").value;
    const query = `year=${encodeURIComponent(year)}` + (month !== "all" ? `&month=${encodeURIComponent(month)}` : "");

    try {
        createBarChart(await Pronto.api(`/api/dashboard/monthly-status-summary?${query}`));
    } catch (err) {
        console.error("[dashboard] monthly chart:", err);
        showEmptyState(document.getElementById("barChart"), document.getElementById("barChartEmpty"), err.message);
    }
}

function populateFilters() {
    const yearSelect = document.getElementById("yearSelect");
    const monthSelect = document.getElementById("monthSelect");
    const currentYear = new Date().getFullYear();

    yearSelect.innerHTML = [currentYear - 1, currentYear, currentYear + 1]
        .map((year) => `<option value="${year}">${year}</option>`).join("");
    yearSelect.value = currentYear;

    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    monthSelect.innerHTML = `<option value="all">All Months</option>` +
        names.map((name, index) => `<option value="${index + 1}">${name}</option>`).join("");
}

async function loadRecentTickets() {
    const body = document.getElementById("recentTicketsBody");

    try {
        const tickets = await Pronto.api("/api/tickets/recent?limit=8");

        if (!tickets.length) {
            body.innerHTML = `<tr><td colspan="5" class="empty-state">No tickets yet. Create one to get started.</td></tr>`;
            return;
        }

        body.innerHTML = tickets.map((t) => `
            <tr>
                <td>${Pronto.escapeHtml(t.pronto_no || "-")}</td>
                <td>${Pronto.escapeHtml(t.country || "-")}</td>
                <td>${Pronto.escapeHtml(t.owner_name || "-")}</td>
                <td><span class="status-badge ${t.status === "Closed" ? "status-closed" : "status-open"}">${Pronto.escapeHtml(t.status)}</span></td>
                <td>${Pronto.formatDate(t.intimate_date)}</td>
            </tr>`).join("");
    } catch (err) {
        console.error("[dashboard] recent tickets:", err);
        body.innerHTML = `<tr><td colspan="5" class="empty-state">${Pronto.escapeHtml(err.message)}</td></tr>`;
    }
}

async function loadDashboardData() {
    if (typeof Chart === "undefined") {
        console.error("[dashboard] Chart.js did not load - run `npm install`.");
    }
    await Promise.all([loadSummary(), loadStatusChart(), loadBarChart(), loadRecentTickets()]);
}

populateFilters();
document.getElementById("yearSelect").addEventListener("change", loadBarChart);
document.getElementById("monthSelect").addEventListener("change", loadBarChart);
window.addEventListener("focus", loadDashboardData);
setInterval(() => { if (!document.hidden) loadDashboardData(); }, 30000);
loadDashboardData();
