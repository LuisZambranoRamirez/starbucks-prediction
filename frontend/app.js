const API_BASE = "https://starbucks-prediction-api.onrender.com"; // Conexión al Backend en Render 
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const STORES = [
  { id: 3, name: "Tienda San Isidro" },
  { id: 5, name: "Lower Manhattan" },
  { id: 8, name: "Hell's Kitchen" },
];

const LEVEL_LABEL = { verde: "Verde", amarillo: "Amarillo", rojo: "Rojo" };
const INSIGHT = { leche: "leche entera", cafe: "café en grano", bolleria: "bollería" };

const PRODUCTS = [
  { id: 22, name: "Drip coffee" },
  { id: 38, name: "Barista Espresso" },
  { id: 59, name: "Hot chocolate" },
  { id: 57, name: "Brewed Chai tea" },
  { id: 51, name: "Brewed Black tea" },
  { id: 47, name: "Brewed Green tea" },
  { id: 75, name: "Pastry" },
  { id: 77, name: "Scone" },
];

const OPTIMIZE_URL = `${API_BASE}/api/optimize-inventory`; // Se añadió la API de Render en el inventario
const mainEl = document.querySelector("main");
const clientModeLink = document.querySelector("#client-mode");
const storeButton = document.querySelector("#store-button");
const storeName = document.querySelector("#store-name");
const storeMenu = document.querySelector("#store-menu");
const totalEl = document.querySelector("#total");
const totalNote = document.querySelector("#total-note");
const updatedEl = document.querySelector("#updated");
const peakCard = document.querySelector("#peak-card");
const peakSlot = document.querySelector("#peak-slot");
const peakCustomers = document.querySelector("#peak-customers");
const chartEl = document.querySelector("#chart");
const chartTip = document.querySelector("#chart-tip");
const baristasEl = document.querySelector("#baristas");
const productsEl = document.querySelector("#products");
const banner = document.querySelector("#banner");
const bannerCount = document.querySelector("#banner-count");
const bannerSlot = document.querySelector("#banner-slot");
const bannerText = document.querySelector("#banner-text");

const invForm = document.querySelector("#inv-form");
const invProduct = document.querySelector("#inv-product");
const invHorizon = document.querySelector("#inv-horizon");
const invStock = document.querySelector("#inv-stock");
const invRun = document.querySelector("#inv-run");
const invSummary = document.querySelector("#inv-summary");
const invResult = document.querySelector("#inv-result");
const invUnitCost = document.querySelector("#inv-unit-cost");
const invOrderCost = document.querySelector("#inv-order-cost");
const invHoldingCost = document.querySelector("#inv-holding-cost");
const invStockoutCost = document.querySelector("#inv-stockout-cost");

const INVENTORY_EMPTY =
  "Elige un producto y pulsa «Calcular plan» para que A* proponga los pedidos de los próximos días.";

let plan = null;
let storeId = 3;
let selectedIndex = 0;
let levelFilter = null;
let requestSerial = 0;
let inventorySerial = 0;
let inventoryBusy = false;

function formatUpdated(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  const dayStart = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const diff = Math.round((dayStart(today) - dayStart(date)) / 86400000);
  const day = diff === 0 ? "Hoy" : diff === 1 ? "Ayer" : date.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${time}`;
}

function formatTomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatPlanDate(iso) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function hourSummary(hour, isPeak) {
  const parts = [
    `Esperamos ${hour.customers.toLocaleString("es-PE")} clientes y recomendamos ${hour.baristas} baristas.`,
  ];
  if (isPeak) parts.push("Es la hora con más clientes.");
  const reds = Object.keys(INSIGHT).filter((key) => hour.products[key] === "rojo").map((key) => INSIGHT[key]);
  const yellows = Object.keys(INSIGHT).filter((key) => hour.products[key] === "amarillo").map((key) => INSIGHT[key]);
  if (reds.length) parts.push(`Revisa primero ${joinList(reds)} (Rojo).`);
  if (yellows.length) parts.push(`Después haz seguimiento de ${joinList(yellows)} (Amarillo).`);
  if (!reds.length && !yellows.length) parts.push("Ningún insumo del piloto está en alerta en esa hora.");
  return parts.join(" ");
}

function storeLabel(id) {
  return STORES.find((store) => store.id === id)?.name || `Tienda ${id}`;
}

function renderMenu() {
  storeMenu.replaceChildren();
  for (const store of STORES) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.role = "option";
    button.textContent = store.name;
    button.setAttribute("aria-selected", String(store.id === storeId));
    button.addEventListener("click", () => {
      closeMenu();
      if (store.id !== storeId) loadStore(store.id);
    });
    item.append(button);
    storeMenu.append(item);
  }
}

function openMenu() {
  storeMenu.hidden = false;
  storeButton.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  storeMenu.hidden = true;
  storeButton.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  if (storeMenu.hidden) openMenu();
  else closeMenu();
}

function setBusy(isBusy) {
  mainEl.classList.toggle("is-busy", isBusy);
  mainEl.setAttribute("aria-busy", String(isBusy));
}

function render() {
  const store = storeLabel(storeId);
  storeName.textContent = store;
  if (clientModeLink) clientModeLink.href = `/recommender.html?store_id=${storeId}`;
  document.title = `Starbucks Predict · ${store}`;
  renderMenu();

  totalEl.textContent = plan.total_customers.toLocaleString("es-PE");
  totalNote.textContent = plan.model.fallback
    ? "Usamos el promedio del mismo día de semana porque SARIMAX no convergió."
    : `Predicción SARIMAX para el ${formatTomorrow()}, calculada desde las franjas`;
  updatedEl.textContent = formatUpdated(plan.generated_at);
  peakSlot.textContent = plan.peak.period_label;
  peakCustomers.textContent = `${plan.peak.customers.toLocaleString("es-PE")} clientes esperados.`;
  peakCard.setAttribute("aria-label", `Ver la hora con más clientes, ${plan.peak.period_label}`);

  renderChart();
  renderBaristas();
  renderProducts();
  paintFilter();
  paintBanner();
  banner.classList.remove("error");
}

function renderBaristas() {
  baristasEl.replaceChildren();
  plan.hours.forEach((hour, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "barista-row";
    row.dataset.index = String(index);
    if (hour.peak) row.classList.add("is-peak");
    if (index === selectedIndex) row.classList.add("is-selected");
    row.setAttribute("aria-pressed", String(index === selectedIndex));
    const label = document.createElement("span");
    label.className = "slot-name";
    label.textContent = hour.label;
    const count = document.createElement("strong");
    count.textContent = String(hour.baristas);
    row.append(label, count);
    row.addEventListener("click", () => selectHour(index));
    baristasEl.append(row);
  });
}

function renderProducts() {
  productsEl.replaceChildren();
  plan.hours.forEach((hour, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "product-row";
    row.dataset.index = String(index);
    if (hour.peak) row.classList.add("is-peak");
    if (index === selectedIndex) row.classList.add("is-selected");
    row.setAttribute("aria-pressed", String(index === selectedIndex));
    const label = document.createElement("span");
    label.className = "slot-name";
    label.textContent = hour.axis;
    row.append(label);
    for (const key of ["leche", "cafe", "bolleria"]) {
      const level = hour.products[key];
      const pill = document.createElement("span");
      pill.className = `pill ${level}`;
      pill.dataset.level = level;
      pill.textContent = LEVEL_LABEL[level];
      row.append(pill);
    }
    row.addEventListener("click", () => selectHour(index));
    productsEl.append(row);
  });
}

function paintBanner() {
  const hour = plan.hours[selectedIndex];
  banner.classList.remove("error");
  bannerCount.textContent = String(hour.baristas);
  bannerSlot.textContent = hour.label;
  bannerText.textContent = hourSummary(hour, hour.peak);
}

function selectHour(index) {
  if (!plan || index < 0 || index >= plan.hours.length || index === selectedIndex) {
    if (plan && index === selectedIndex) paintBanner();
    return;
  }
  selectedIndex = index;
  for (const row of document.querySelectorAll(".barista-row, .product-row")) {
    const selected = Number(row.dataset.index) === selectedIndex;
    row.classList.toggle("is-selected", selected);
    row.setAttribute("aria-pressed", String(selected));
  }
  renderChart();
  paintBanner();
}

function selectPeak() {
  if (!plan) return;
  const index = plan.hours.findIndex((hour) => hour.peak);
  selectHour(index < 0 ? 0 : index);
  document.querySelector(`.barista-row[data-index="${selectedIndex}"]`)?.focus();
}

function moveHour(step) {
  if (!plan) return;
  selectHour(Math.max(0, Math.min(plan.hours.length - 1, selectedIndex + step)));
}

function paintFilter() {
  for (const pill of document.querySelectorAll(".pill")) {
    pill.classList.toggle("is-dim", Boolean(levelFilter) && pill.dataset.level !== levelFilter);
  }
  for (const button of document.querySelectorAll(".legend-btn")) {
    const on = button.dataset.level === levelFilter;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
  }
}

function niceMax(value) {
  const padded = Math.max(value * 1.18, 4);
  const power = 10 ** Math.floor(Math.log10(padded));
  for (const step of [1, 2, 2.5, 4, 5, 10]) {
    const candidate = step * power;
    if (candidate >= padded) return candidate;
  }
  return padded;
}

function renderChart() {
  const hours = plan.hours;
  const width = 640;
  const height = 320;
  const pad = { top: 28, right: 16, bottom: 32, left: 36 };
  const max = niceMax(Math.max(...hours.map((hour) => hour.customers), 1));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xAt = (index) => pad.left + (hours.length === 1 ? innerW / 2 : (index / (hours.length - 1)) * innerW);
  const yAt = (value) => pad.top + innerH - (value / max) * innerH;
  const points = hours.map((hour, index) => ({ x: xAt(index), y: yAt(hour.customers), hour, index }));

  const grid = [];
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = Math.round((max / 4) * tick);
    const y = yAt(value);
    grid.push(`
      <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(255,255,255,0.06)" />
      <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#6f776f" font-size="11">${value}</text>
    `);
  }

  const curve = curvePath(points);
  const area = `${curve} L ${points[points.length - 1].x} ${yAt(0)} L ${points[0].x} ${yAt(0)} Z`;
  const selected = points[selectedIndex];
  const dots = points.map((point) => {
    const active = point.index === selectedIndex;
    const radius = active ? 5.5 : 3.5;
    return `
      <circle class="hit" data-index="${point.index}" cx="${point.x}" cy="${point.y}" r="16" fill="transparent" />
      <circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="${active ? "#f3ffc4" : "#cdfe6f"}" stroke="#10140a" stroke-width="${active ? 2 : 0}" pointer-events="none" />
    `;
  }).join("");
  const labels = points.map((point) => `
    <text x="${point.x}" y="${height - 8}" text-anchor="middle" fill="${point.index === selectedIndex ? "#f4f5f2" : "#6f776f"}" font-size="11">${point.hour.axis}</text>
  `).join("");

  chartEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="presentation">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#cdfe6f" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#cdfe6f" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${grid.join("")}
      <path d="${area}" fill="url(#area)"></path>
      <path d="${curve}" fill="none" stroke="#cdfe6f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
      ${dots}
      <text x="${selected.x}" y="${Math.max(16, selected.y - 14)}" text-anchor="middle" fill="#e7ff9a" font-size="13" font-weight="700">${selected.hour.customers}</text>
      ${labels}
    </svg>
  `;
  chartEl.setAttribute("aria-label", `${selected.hour.label}: ${selected.hour.customers} clientes. Usa las flechas para cambiar de franja.`);
}

function curvePath(points) {
  if (points.length === 0) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index === 0 ? 0 : index - 1];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function showTip(index, event) {
  const hour = plan.hours[index];
  const wrap = chartEl.parentElement.getBoundingClientRect();
  chartTip.hidden = false;
  chartTip.textContent = `${hour.label} · ${hour.customers} clientes`;
  const left = Math.min(Math.max(event.clientX - wrap.left, 70), wrap.width - 70);
  chartTip.style.left = `${left}px`;
  chartTip.style.top = `${event.clientY - wrap.top}px`;
}

function hideTip() {
  chartTip.hidden = true;
}

function showError(message) {
  banner.classList.add("error");
  bannerCount.textContent = "!";
  bannerSlot.textContent = "No se pudo calcular la jornada";
  bannerText.textContent = message;
  totalNote.textContent = "La predicción no está disponible.";
}

function renderProductOptions() {
  invProduct.replaceChildren();
  for (const product of PRODUCTS) {
    const option = document.createElement("option");
    option.value = String(product.id);
    option.textContent = product.name;
    invProduct.append(option);
  }
  invProduct.value = String(PRODUCTS[0].id);
}

function setInventoryBusy(isBusy) {
  inventoryBusy = isBusy;
  invRun.disabled = isBusy;
  invRun.textContent = isBusy ? "Optimizando…" : "Calcular plan";
  invForm.setAttribute("aria-busy", String(isBusy));
  invResult.classList.toggle("is-loading", isBusy);
}

function resetInventory(message = INVENTORY_EMPTY) {
  inventorySerial += 1;
  setInventoryBusy(false);
  invSummary.hidden = true;
  invSummary.replaceChildren();
  invResult.replaceChildren();
  const note = document.createElement("p");
  note.className = "inv-note";
  note.textContent = message;
  invResult.append(note);
}

function readInventoryForm() {
  const body = {
    store_id: storeId,
    product_id: Number(invProduct.value),
    horizon_days: clampInteger(invHorizon.value, 1, 30, 7),
    initial_inventory: clampInteger(invStock.value, 0, 999999, 10),
  };

  const numericFields = [
    ["unit_purchase_cost", invUnitCost],
    ["order_fixed_cost", invOrderCost],
    ["holding_cost_per_unit", invHoldingCost],
    ["stockout_penalty_per_unit", invStockoutCost],
  ];
  for (const [key, input] of numericFields) {
    const raw = input.value.trim();
    if (raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) body[key] = value;
  }
  return body;
}

function summaryTile(label, value) {
  const tile = document.createElement("div");
  tile.className = "inv-tile";
  const labelEl = document.createElement("p");
  labelEl.className = "label";
  labelEl.textContent = label;
  const valueEl = document.createElement("p");
  valueEl.className = "value";
  valueEl.textContent = value;
  tile.append(labelEl, valueEl);
  return tile;
}

function renderInventoryTable(body) {
  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll inv-table-scroll";

  const table = document.createElement("table");
  table.className = "inv-table";

  const caption = document.createElement("caption");
  caption.className = "inv-caption";
  const scope = body.store_id == null ? "Todas las tiendas" : storeLabel(body.store_id);
  caption.textContent = `Plan de ${body.plan.length} días para ${body.product_name} en ${scope}.`;
  table.append(caption);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const title of ["Fecha", "Demanda", "Stock inicial", "Pedido", "Stock final", "No atendido", "Costo del día"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = title;
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  for (const step of body.plan) {
    const row = document.createElement("tr");
    if (step.order_quantity > 0) row.classList.add("has-order");
    if (step.unmet_demand > 0) row.classList.add("has-unmet");

    const dateCell = document.createElement("th");
    dateCell.scope = "row";
    dateCell.textContent = formatPlanDate(step.date);

    const values = [
      step.predicted_demand.toLocaleString("es-PE"),
      step.starting_inventory.toLocaleString("es-PE"),
      step.order_quantity > 0 ? `+${step.order_quantity}` : "—",
      step.ending_inventory.toLocaleString("es-PE"),
      step.unmet_demand > 0 ? String(step.unmet_demand) : "—",
      step.day_cost.toFixed(2),
    ];
    const cells = values.map((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 2) cell.className = "inv-order";
      if (index === 4 && step.unmet_demand > 0) cell.className = "inv-unmet";
      return cell;
    });

    row.append(dateCell, ...cells);
    tbody.append(row);
  }

  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function renderInventory(body) {
  const product = PRODUCTS.find((item) => item.id === body.product_id);
  const productName = product ? product.name : `Producto ${body.product_id}`;
  const totalUnits = body.plan.reduce((sum, step) => sum + step.order_quantity, 0);
  const unmetTotal = body.plan.reduce((sum, step) => sum + step.unmet_demand, 0);

  invSummary.hidden = false;
  invSummary.replaceChildren(
    summaryTile("Costo total estimado", body.total_cost.toFixed(2)),
    summaryTile("Costo unitario usado", body.unit_purchase_cost_used.toFixed(2)),
    summaryTile("Nodos explorados (A*)", body.nodes_explored.toLocaleString("es-PE")),
    summaryTile("Unidades a pedir", totalUnits.toLocaleString("es-PE")),
  );

  const meta = document.createElement("p");
  meta.className = "inv-meta";
  const coverage = unmetTotal > 0
    ? `${unmetTotal} unidades quedarían sin atender`
    : "toda la demanda proyectada queda cubierta";
  meta.textContent = `${productName} · ${storeLabel(body.store_id)} · ${body.plan.length} días · ${coverage}.`;

  invResult.replaceChildren(meta, renderInventoryTable({ ...body, product_name: productName }));
}

function showInventoryError(message) {
  setInventoryBusy(false);
  invSummary.hidden = true;
  invSummary.replaceChildren();
  invResult.replaceChildren();
  const box = document.createElement("p");
  box.className = "inv-note inv-error";
  box.setAttribute("role", "alert");
  box.textContent = message;
  invResult.append(box);
}

async function loadInventoryPlan() {
  const serial = ++inventorySerial;
  const body = readInventoryForm();
  setInventoryBusy(true);
  invSummary.hidden = true;
  invResult.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "inv-note";
  loading.textContent = "Entrenando SARIMAX y explorando los pedidos con A*…";
  invResult.append(loading);

  try {
    const response = await fetch(OPTIMIZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (serial !== inventorySerial) return;
    if (!response.ok) {
      const detail = payload && typeof payload.detail === "string"
        ? payload.detail
        : "El optimizador no respondió.";
      throw new Error(detail);
    }
    if (!payload || !Array.isArray(payload.plan)) {
      throw new Error("El optimizador devolvió una respuesta inesperada.");
    }
    renderInventory(payload);
  } catch (error) {
    if (serial !== inventorySerial) return;
    showInventoryError(error.message || "No hay conexión con el optimizador.");
  } finally {
    if (serial === inventorySerial) setInventoryBusy(false);
  }
}

async function loadStore(id) {
  const serial = ++requestSerial;
  setBusy(true);
  resetInventory("Selecciona el producto y pulsa «Calcular plan» para esta tienda.");
  totalNote.textContent = "Calculando la predicción SARIMAX…";
  try {
    const response = await fetch(`${API_BASE}/api/day-plan?store_id=${id}`); /* Añadida la apibase */
    const body = await response.json();
    if (serial !== requestSerial) return;
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail : "El modelo no respondió.";
      throw new Error(detail);
    }
    storeId = id;
    plan = body;
    selectedIndex = Math.max(0, plan.hours.findIndex((hour) => hour.peak));
    levelFilter = null;
    render();
  } catch (error) {
    if (serial !== requestSerial) return;
    showError(error.message || "No hay conexión con el modelo.");
  } finally {
    if (serial === requestSerial) setBusy(false);
  }
}

function onHourKey(event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowLeft") return;
  event.preventDefault();
  const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
  moveHour(step);
  if (event.currentTarget === chartEl) return;
  event.currentTarget.querySelector(`[data-index="${selectedIndex}"]`)?.focus();
}

storeButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu();
});
storeMenu.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", () => closeMenu());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

peakCard.addEventListener("click", selectPeak);
peakCard.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectPeak();
  }
});

chartEl.addEventListener("click", (event) => {
  const hit = event.target.closest?.("[data-index]");
  if (!hit) return;
  selectHour(Number(hit.dataset.index));
});
chartEl.addEventListener("mousemove", (event) => {
  const hit = event.target.closest?.("[data-index]");
  if (!hit || !plan) {
    hideTip();
    return;
  }
  showTip(Number(hit.dataset.index), event);
});
chartEl.addEventListener("mouseleave", hideTip);
chartEl.addEventListener("keydown", onHourKey);
baristasEl.addEventListener("keydown", onHourKey);
productsEl.addEventListener("keydown", onHourKey);

for (const button of document.querySelectorAll(".legend-btn")) {
  button.addEventListener("click", () => {
    levelFilter = levelFilter === button.dataset.level ? null : button.dataset.level;
    paintFilter();
  });
}

invForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!inventoryBusy) loadInventoryPlan();
});

renderProductOptions();
renderMenu();
loadStore(storeId);
