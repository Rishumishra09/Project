const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let tickets = [];
let currentUser = null;
let pendingDeleteId = null;
let toastTimer = null;

const statusClass = (status) => status.toLowerCase().replace(/\s+/g, "-");
const priorityClass = (priority) => priority.toLowerCase();
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const formatDate = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const iconForCategory = (category) => ({
  Hardware: "⌘", Software: "▣", Network: "⌁", Account: "♙", Other: "✧"
}[category] || "▤");

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Something went wrong.");
  return body;
}

function ticketCell(ticket) {
  return `<div class="ticket-cell"><span class="ticket-mini-icon">${iconForCategory(ticket.category)}</span><div class="ticket-cell-copy"><strong>${escapeHtml(ticket.title)}</strong><span>${escapeHtml(ticket.id)} · ${escapeHtml(formatDate(ticket.createdAt))}</span></div></div>`;
}
function priorityBadge(priority) {
  return `<span class="priority-badge priority-${priorityClass(priority)}">${escapeHtml(priority)}</span>`;
}
function statusBadge(status) {
  return `<span class="status-badge status-${statusClass(status)}">${escapeHtml(status)}</span>`;
}
function getFilteredTickets(search, status = "All", priority = "All") {
  const query = search.trim().toLowerCase();
  return tickets.filter(ticket => {
    const matchesQuery = !query || [ticket.id, ticket.title, ticket.requester, ticket.category, ticket.description].some(value => String(value || "").toLowerCase().includes(query));
    const matchesStatus = status === "All" || ticket.status === status;
    const matchesPriority = priority === "All" || ticket.priority === priority;
    return matchesQuery && matchesStatus && matchesPriority;
  });
}

function renderStats() {
  const total = tickets.length;
  const open = tickets.filter(ticket => ticket.status === "Open").length;
  const progress = tickets.filter(ticket => ticket.status === "In Progress").length;
  const resolved = tickets.filter(ticket => ticket.status === "Resolved").length;
  $("#totalStat").textContent = total;
  $("#openStat").textContent = open;
  $("#progressStat").textContent = progress;
  $("#resolvedStat").textContent = resolved;
  $("#sidebarCount").textContent = total;
  $("#legendResolved").textContent = resolved;
  $("#legendProgress").textContent = progress;
  $("#legendOpen").textContent = open;
  const percent = total ? Math.round((resolved / total) * 100) : 0;
  $("#resolutionPercent").textContent = `${percent}%`;
  const resolvedAngle = total ? (resolved / total) * 360 : 0;
  const progressAngle = total ? (progress / total) * 360 : 0;
  const openAngle = total ? (open / total) * 360 : 0;
  $("#donut").style.background = `conic-gradient(var(--green) 0deg ${resolvedAngle}deg, var(--purple) ${resolvedAngle}deg ${resolvedAngle + progressAngle}deg, #e6a14c ${resolvedAngle + progressAngle}deg ${resolvedAngle + progressAngle + openAngle}deg, #eaf0f5 ${resolvedAngle + progressAngle + openAngle}deg 360deg)`;
}

function renderOverview() {
  const filtered = getFilteredTickets($("#overviewSearch").value, $("#overviewStatus").value).slice(0, 6);
  $("#overviewTable").innerHTML = filtered.map(ticket => `<tr>
    <td>${ticketCell(ticket)}</td>
    <td><span class="requester">${escapeHtml(ticket.requester)}</span></td>
    <td>${priorityBadge(ticket.priority)}</td>
    <td>${statusBadge(ticket.status)}</td>
    <td><button class="row-menu" data-view-ticket="${escapeHtml(ticket.id)}" title="View ticket">···</button></td>
  </tr>`).join("");
  $("#overviewEmpty").classList.toggle("hidden", filtered.length !== 0);
  $("#overviewFooter").textContent = `Showing ${filtered.length} of ${tickets.length} tickets`;
}

function renderList() {
  const filtered = getFilteredTickets($("#listSearch").value, $("#listStatus").value, $("#listPriority").value);
  $("#listTable").innerHTML = filtered.map(ticket => `<tr>
    <td><div class="detail-title"><strong>${escapeHtml(ticket.title)}</strong><span>${escapeHtml(ticket.id)} · ${escapeHtml(ticket.description || "No description provided")}</span></div></td>
    <td><span class="requester">${escapeHtml(ticket.requester)}</span></td>
    <td>${escapeHtml(ticket.category)}</td>
    <td>${priorityBadge(ticket.priority)}</td>
    <td>${currentUser && currentUser.role === "admin" ? `<select class="status-select" data-status-id="${escapeHtml(ticket.id)}" aria-label="Update status for ${escapeHtml(ticket.id)}">${["Open", "In Progress", "Resolved"].map(status => `<option ${ticket.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>` : statusBadge(ticket.status)}</td>
    <td>${escapeHtml(formatDate(ticket.createdAt))}</td>
    <td>${currentUser && currentUser.role === "admin" ? `<div class="action-group"><button class="small-action delete" data-delete-id="${escapeHtml(ticket.id)}" aria-label="Delete ${escapeHtml(ticket.id)}">Delete</button></div>` : `<span style="color:#9aa4b4;font-size:10px">View only</span>`}</td>
  </tr>`).join("");
  $("#listEmpty").classList.toggle("hidden", filtered.length !== 0);
  $("#listFooter").textContent = `Showing ${filtered.length} of ${tickets.length} tickets`;
}

function renderAll() {
  renderStats();
  renderOverview();
  renderList();
}

async function loadTickets() {
  try {
    const session = await api("/api/me");
    currentUser = session.user;
    if (!currentUser) { location.href = "/login.html"; return; }
    const isAdmin = currentUser.role === "admin";
    document.querySelector(".profile-copy strong").textContent = currentUser.name;
    document.querySelector(".profile-copy span").textContent = isAdmin ? "Admin · IT Support" : "Employee · User";
    document.querySelector(".avatar").textContent = currentUser.name.split(/\s+/).map(part => part[0]).join("").slice(0,2).toUpperCase();
    document.querySelector(".top-avatar").textContent = document.querySelector(".avatar").textContent;
    if (!isAdmin) {
      const requesterInput = document.querySelector("#requester");
      requesterInput.value = currentUser.name;
      requesterInput.readOnly = true;
      requesterInput.style.background = "#f7f9fc";
      document.querySelectorAll('[data-view="overview"]').forEach(el => el.innerHTML = '<span class="nav-icon">▦</span> My dashboard');
      document.querySelectorAll('[data-view="tickets"]').forEach(el => el.innerHTML = '<span class="nav-icon">▤</span> My tickets');
      document.querySelectorAll('[data-view="create"]').forEach(el => el.innerHTML = '<span class="nav-icon">＋</span> Raise a ticket');
      document.querySelectorAll('[id="newTicketTop"], [id="newTicketList"], [id="quickCreate"]').forEach(el => el.style.display = "none");
      document.querySelectorAll('[data-view="create"]').forEach(el => el.style.display = "flex");
      document.querySelectorAll('.summary-tip').forEach(el => el.innerHTML = '<span>✦</span><p><strong>Track your requests</strong><br>Raise a ticket and check its status here.</p>');
      document.querySelectorAll('.help-card strong').forEach(el => el.textContent = 'Need IT support?');
      document.querySelectorAll('.help-card p').forEach(el => el.textContent = 'Report an issue and follow its progress here.');
      document.querySelectorAll('.help-link').forEach(el => { el.textContent = 'Raise a ticket'; el.style.display = 'none'; });
      document.querySelectorAll('.eyebrow').forEach(el => { if (el.textContent.includes('YOUR SUPPORT OVERVIEW')) el.textContent = 'YOUR SUPPORT OVERVIEW'; });
      document.querySelectorAll('.page-heading h1').forEach(el => { if (el.textContent.includes('Rishu')) el.innerHTML = `Welcome, ${escapeHtml(currentUser.name)} <span class="wave">✦</span>`; });
      document.querySelectorAll('.wide-table thead th:last-child').forEach(el => el.textContent = 'Ticket status');
    }
    document.querySelector(".top-actions").insertAdjacentHTML("beforeend", '<button id="logoutButton" class="secondary-button" style="padding:8px 10px;font-size:10px">Log out</button>');
    document.querySelector("#logoutButton").addEventListener("click", async () => { try { await api("/api/logout", {method:"POST"}); location.href="/login.html"; } catch (e) { showToast(e.message); } });
    tickets = await api("/api/tickets");
    renderAll();
  } catch (error) {
    showToast(error.message + " Is the server running?");
  }
}

function setView(view) {
  const titles = { overview: "Overview", tickets: "All tickets", create: "Create ticket" };
  Object.entries({ overview: "#overviewView", tickets: "#ticketsView", create: "#createView" }).forEach(([key, selector]) => {
    $(selector).classList.toggle("hidden", key !== view);
  });
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $("#breadcrumbCurrent").textContent = titles[view] || "Overview";
  $("#sidebar").classList.remove("open");
  if (view === "create") setTimeout(() => $("#requester").focus(), 50);
}
function openCreate() {
  $("#ticketForm").reset();
  $("#priority").value = "Medium";
  if (currentUser && currentUser.role !== "admin") {
    $("#requester").value = currentUser.name;
    $("#requester").readOnly = true;
  }
  setView("create");
}

async function createTicket(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = $("#submitTicket");
  const payload = {
    requester: $("#requester").value,
    title: $("#title").value,
    category: $("#category").value,
    priority: $("#priority").value,
    description: $("#description").value
  };
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  try {
    const ticket = await api("/api/tickets", { method: "POST", body: JSON.stringify(payload) });
    tickets.unshift(ticket);
    renderAll();
    form.reset();
    $("#priority").value = "Medium";
    setView("tickets");
    $("#listSearch").value = ticket.id;
    renderList();
    showToast(`Ticket ${ticket.id} created successfully.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "<span>＋</span> Submit ticket";
  }
}

async function updateStatus(id, status) {
  try {
    const updated = await api(`/api/tickets/${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify({ status })
    });
    tickets = tickets.map(ticket => ticket.id === id ? updated : ticket);
    renderAll();
    showToast(`${id} status updated to ${status}.`);
  } catch (error) {
    showToast(error.message);
    renderList();
  }
}

function askDelete(id) {
  pendingDeleteId = id;
  $("#confirmModal").classList.remove("hidden");
  $("#confirmDelete").focus();
}
function closeDeleteModal() {
  pendingDeleteId = null;
  $("#confirmModal").classList.add("hidden");
}
async function deleteTicket() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  try {
    await api(`/api/tickets/${encodeURIComponent(id)}`, { method: "DELETE" });
    tickets = tickets.filter(ticket => ticket.id !== id);
    closeDeleteModal();
    renderAll();
    showToast(`${id} deleted.`);
  } catch (error) {
    showToast(error.message);
  }
}

$$(".nav-item").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
$("#quickCreate").addEventListener("click", openCreate);
$("#newTicketTop").addEventListener("click", openCreate);
$("#newTicketList").addEventListener("click", openCreate);
$("#cancelCreate").addEventListener("click", () => setView("overview"));
$("#ticketForm").addEventListener("submit", createTicket);
$("#viewAll").addEventListener("click", () => setView("tickets"));
$("#viewAllBottom").addEventListener("click", () => setView("tickets"));
$("#overviewSearch").addEventListener("input", renderOverview);
$("#overviewStatus").addEventListener("change", renderOverview);
$("#listSearch").addEventListener("input", renderList);
$("#listStatus").addEventListener("change", renderList);
$("#listPriority").addEventListener("change", renderList);
$("#clearFilters").addEventListener("click", () => {
  $("#listSearch").value = "";
  $("#listStatus").value = "All";
  $("#listPriority").value = "All";
  renderList();
});
$("#listTable").addEventListener("change", event => {
  const select = event.target.closest("[data-status-id]");
  if (select) updateStatus(select.dataset.statusId, select.value);
});
$("#listTable").addEventListener("click", event => {
  const button = event.target.closest("[data-delete-id]");
  if (button) askDelete(button.dataset.deleteId);
});
$("#overviewTable").addEventListener("click", event => {
  const button = event.target.closest("[data-view-ticket]");
  if (!button) return;
  setView("tickets");
  $("#listSearch").value = button.dataset.viewTicket;
  renderList();
});
$("#confirmDelete").addEventListener("click", deleteTicket);
$("#keepTicket").addEventListener("click", closeDeleteModal);
$("#confirmModal").addEventListener("click", event => {
  if (event.target === $("#confirmModal")) closeDeleteModal();
});
$("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeDeleteModal();
    $("#sidebar").classList.remove("open");
  }
});

loadTickets();