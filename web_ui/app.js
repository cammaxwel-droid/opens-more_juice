/**
 * my_new_tool — Operational Workbench Client
 * Connects to http://127.0.0.1:8080 through the same-origin /api reverse proxy
 * (or directly if opened against a CORS-enabled instance).
 */

const API_BASE = "/api";
const BACKEND_DISPLAY = "http://127.0.0.1:8080";

const SAMPLE_TARGETS = {
  my_tool: ["example.com", "cloudflare.com"],
  http_title: ["example.com", "iana.org"],
  string_info: ["opens-more-juice", "CarbonCrimson2026"],
  default: ["example.com", "cloudflare.com"],
};

const state = {
  plugins: [],
  filterQuery: "",
  activePlugin: null,
  activeSchema: null,
  isRunning: false,
  abortController: null,
  activeView: "table",
  latestRun: null,
  history: [],
  connected: false,
};

/* DOM References */
const els = {
  serviceVersion: document.getElementById("service-version"),
  connectionPill: document.getElementById("connection-pill"),
  connectionLabel: document.getElementById("connection-label"),
  refreshPluginsBtn: document.getElementById("refresh-plugins-btn"),
  pluginCountBadge: document.getElementById("plugin-count-badge"),
  pluginFilterInput: document.getElementById("plugin-filter-input"),
  pluginList: document.getElementById("plugin-list"),
  schemaVersionBadge: document.getElementById("schema-version-badge"),
  schemaInspector: document.getElementById("schema-inspector"),
  mobilePluginSelect: document.getElementById("mobile-plugin-select"),
  mobileSchemaVersion: document.getElementById("mobile-schema-version"),
  mobileSchemaInspector: document.getElementById("mobile-schema-inspector"),
  backendErrorBanner: document.getElementById("backend-error-banner"),
  backendErrorTitle: document.getElementById("backend-error-title"),
  backendErrorDetail: document.getElementById("backend-error-detail"),
  copyServerCmdBtn: document.getElementById("copy-server-cmd-btn"),
  retryConnectionBtn: document.getElementById("retry-connection-btn"),
  activePluginTitle: document.getElementById("active-plugin-title"),
  activePluginRoute: document.getElementById("active-plugin-route"),
  activePluginDescription: document.getElementById("active-plugin-description"),
  copyCurlBtn: document.getElementById("copy-curl-btn"),
  runForm: document.getElementById("run-form"),
  targetsInput: document.getElementById("targets-input"),
  targetCountPill: document.getElementById("target-count-pill"),
  loadSampleBtn: document.getElementById("load-sample-btn"),
  importFileBtn: document.getElementById("import-file-btn"),
  targetFileInput: document.getElementById("target-file-input"),
  clearTargetsBtn: document.getElementById("clear-targets-btn"),
  defaultOptionsContainer: document.getElementById("default-options-container"),
  customOptionsContainer: document.getElementById("custom-options-container"),
  addCustomOptionBtn: document.getElementById("add-custom-option-btn"),
  concurrencyInput: document.getElementById("concurrency-input"),
  timeoutInput: document.getElementById("timeout-input"),
  proxyInput: document.getElementById("proxy-input"),
  runPluginBtn: document.getElementById("run-plugin-btn"),
  runBtnSpinner: document.getElementById("run-btn-spinner"),
  runBtnIcon: document.getElementById("run-btn-icon"),
  runBtnLabel: document.getElementById("run-btn-label"),
  abortRunBtn: document.getElementById("abort-run-btn"),
  resetDefaultsBtn: document.getElementById("reset-defaults-btn"),
  formFeedback: document.getElementById("form-feedback"),
  metricTargets: document.getElementById("metric-targets"),
  metricFindings: document.getElementById("metric-findings"),
  metricErrors: document.getElementById("metric-errors"),
  metricDuration: document.getElementById("metric-duration"),
  viewTabs: Array.from(document.querySelectorAll(".view-tab")),
  exportJsonBtn: document.getElementById("export-json-btn"),
  exportCsvBtn: document.getElementById("export-csv-btn"),
  exportTxtBtn: document.getElementById("export-txt-btn"),
  panelResults: document.getElementById("panel-results"),
  historyStrip: document.getElementById("history-strip"),
  historyList: document.getElementById("history-list"),
  clearHistoryBtn: document.getElementById("clear-history-btn"),
};

/* Helpers */
function coerceOptionValue(raw) {
  const trimmed = String(raw).trim();
  const low = trimmed.toLowerCase();
  if (["true", "yes", "on"].includes(low)) return true;
  if (["false", "no", "off"].includes(low)) return false;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
  return raw;
}

function parseTargets() {
  return els.targetsInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function updateTargetCount() {
  const count = parseTargets().length;
  els.targetCountPill.textContent = `${count} ${count === 1 ? "target" : "targets"}`;
}

function setFeedback(message, tone = "neutral") {
  els.formFeedback.textContent = message;
  if (tone === "neutral") {
    els.formFeedback.removeAttribute("data-tone");
  } else {
    els.formFeedback.setAttribute("data-tone", tone);
  }
}

function setConnectionState(mode, labelText, errorMessage = null) {
  els.connectionPill.setAttribute("data-state", mode);
  els.connectionLabel.textContent = labelText;
  state.connected = mode === "connected";

  if (mode === "offline") {
    els.backendErrorBanner.hidden = false;
    if (errorMessage) {
      els.backendErrorDetail.textContent = errorMessage;
    }
  } else {
    els.backendErrorBanner.hidden = true;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCellValue(val) {
  if (val === null || val === undefined || val === "") {
    return '<span class="cell-muted">--</span>';
  }
  if (Array.isArray(val)) {
    return escapeHtml(val.join(", "));
  }
  if (typeof val === "object") {
    return `<code>${escapeHtml(JSON.stringify(val))}</code>`;
  }
  return escapeHtml(String(val));
}

function formatCodeBadge(code) {
  const num = Number(code);
  if (!Number.isFinite(num)) return escapeHtml(String(code));
  let cls = "badge";
  if (num >= 200 && num < 300) cls += " badge-ok";
  else if (num >= 300 && num < 500) cls += " badge-warn";
  else if (num >= 500 || num === 0) cls += " badge-err";
  return `<span class="${cls}">${num}</span>`;
}

/* API Layer */
async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }

  if (!response.ok) {
    const detail = payload?.detail || `HTTP ${response.status} ${response.statusText}`;
    const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    err.status = response.status;
    throw err;
  }

  return payload;
}

/* Load Registry & OpenAPI Meta */
async function loadPlugins(preserveSelection = true) {
  setConnectionState("checking", "Checking 127.0.0.1:8080");
  els.refreshPluginsBtn.disabled = true;

  try {
    const [plugins, openapi] = await Promise.all([
      apiFetch("/plugins"),
      apiFetch("/openapi.json").catch(() => null),
    ]);

    if (openapi?.info?.version) {
      els.serviceVersion.textContent = `v${openapi.info.version}`;
    }

    state.plugins = Array.isArray(plugins)
      ? plugins.slice().sort((a, b) => a.name.localeCompare(b.name))
      : [];

    setConnectionState("connected", "Connected · 127.0.0.1:8080");
    els.pluginCountBadge.textContent = `${state.plugins.length} loaded`;
    renderPluginList();

    if (state.plugins.length > 0) {
      const preferred =
        preserveSelection && state.activePlugin && state.plugins.some((p) => p.name === state.activePlugin)
          ? state.activePlugin
          : (state.plugins.find((p) => p.name === "my_tool") || state.plugins[0]).name;
      await selectPlugin(preferred);
    } else {
      els.activePluginTitle.textContent = "No plugins registered";
      els.activePluginDescription.textContent = "Add a plugin file under my_new_tool/plugins/ and refresh.";
    }
  } catch (err) {
    setConnectionState(
      "offline",
      "Offline · 127.0.0.1:8080",
      `${err.message} — Start with: python -m my_new_tool --server 127.0.0.1:8080`
    );
    els.pluginCountBadge.textContent = "0 loaded";
    els.pluginList.innerHTML = `<li class="schema-field-row"><span class="muted-copy">Backend offline. Retry once FastAPI is listening on port 8080.</span></li>`;
    els.activePluginTitle.textContent = "Backend Disconnected";
    els.activePluginRoute.textContent = "POST /plugins/{name}/run";
    els.activePluginDescription.textContent =
      "Waiting for my_new_tool FastAPI microservice at http://127.0.0.1:8080.";
  } finally {
    els.refreshPluginsBtn.disabled = false;
  }
}

function renderPluginList() {
  if (els.mobilePluginSelect) {
    els.mobilePluginSelect.innerHTML = state.plugins
      .map(
        (p) =>
          `<option value="${escapeHtml(p.name)}" ${p.name === state.activePlugin ? "selected" : ""}>${escapeHtml(p.name)} · v${escapeHtml(p.version || "0.1.0")}</option>`
      )
      .join("");
  }

  const q = state.filterQuery.trim().toLowerCase();
  const filtered = state.plugins.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    els.pluginList.innerHTML = `<li class="schema-field-row"><span class="muted-copy">No plugins match "${escapeHtml(state.filterQuery)}".</span></li>`;
    return;
  }

  els.pluginList.innerHTML = filtered
    .map((plugin) => {
      const selected = plugin.name === state.activePlugin;
      return `
        <li role="presentation">
          <button
            type="button"
            role="option"
            class="plugin-item-btn"
            aria-selected="${selected ? "true" : "false"}"
            data-plugin-name="${escapeHtml(plugin.name)}"
          >
            <span class="plugin-item-top">
              <span class="plugin-item-name">${escapeHtml(plugin.name)}</span>
              <span class="plugin-item-ver">v${escapeHtml(plugin.version || "0.1.0")}</span>
            </span>
            <span class="plugin-item-desc">${escapeHtml(plugin.description || "No description provided.")}</span>
          </button>
        </li>
      `;
    })
    .join("");
}

async function selectPlugin(pluginName) {
  state.activePlugin = pluginName;
  renderPluginList();

  const meta = state.plugins.find((p) => p.name === pluginName);
  els.activePluginTitle.textContent = pluginName;
  els.activePluginRoute.textContent = `POST /plugins/${pluginName}/run`;
  els.activePluginDescription.textContent = meta?.description || "";
  els.runBtnLabel.textContent = `Run ${pluginName}`;

  try {
    const schema = await apiFetch(`/plugins/${encodeURIComponent(pluginName)}/schema`);
    state.activeSchema = schema;
    renderSchemaInspector(schema);
    renderDefaultOptions(schema.default_options || {});
  } catch (err) {
    state.activeSchema = null;
    els.schemaVersionBadge.textContent = "error";
    els.schemaInspector.innerHTML = `<p class="muted-copy">Could not load schema: ${escapeHtml(err.message)}</p>`;
    renderDefaultOptions({});
  }
}

function renderSchemaInspector(schema) {
  els.schemaVersionBadge.textContent = `v${schema.version || "0.1.0"}`;
  const outputProps = schema.output_schema?.properties || null;
  const defaultOpts = schema.default_options || {};

  let outputHtml = `<p class="muted-copy">Dynamic output fields (adapts at runtime).</p>`;
  if (outputProps && Object.keys(outputProps).length > 0) {
    outputHtml = `
      <ul class="schema-field-list">
        ${Object.entries(outputProps)
          .map(([field, spec]) => {
            const rawType = Array.isArray(spec.type) ? spec.type.join(" | ") : spec.type || "any";
            const itemType = spec.items?.type ? `<${spec.items.type}>` : "";
            return `
              <li class="schema-field-row">
                <span class="schema-field-key">${escapeHtml(field)}</span>
                <span class="schema-field-type">${escapeHtml(rawType + itemType)}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  let defaultsHtml = `<p class="muted-copy">None declared.</p>`;
  if (Object.keys(defaultOpts).length > 0) {
    defaultsHtml = `
      <ul class="schema-field-list">
        ${Object.entries(defaultOpts)
          .map(
            ([k, v]) => `
            <li class="schema-field-row">
              <span class="schema-field-key">${escapeHtml(k)}</span>
              <span class="schema-field-type">${escapeHtml(JSON.stringify(v))}</span>
            </li>
          `
          )
          .join("")}
      </ul>
    `;
  }

  const schemaHtml = `
    <div>
      <span class="schema-group-label">Output Fields</span>
      ${outputHtml}
    </div>
    <div>
      <span class="schema-group-label">Default Options</span>
      ${defaultsHtml}
    </div>
  `;
  els.schemaInspector.innerHTML = schemaHtml;
  if (els.mobileSchemaVersion) {
    els.mobileSchemaVersion.textContent = `v${schema.version || "0.1.0"}`;
  }
  if (els.mobileSchemaInspector) {
    els.mobileSchemaInspector.innerHTML = schemaHtml;
  }
}

function renderDefaultOptions(defaultOptions) {
  const entries = Object.entries(defaultOptions);
  if (entries.length === 0) {
    els.defaultOptionsContainer.innerHTML = `<p class="muted-copy">No default options for this plugin. Use "Add option" for custom keys.</p>`;
    return;
  }

  els.defaultOptionsContainer.innerHTML = entries
    .map(([key, val]) => {
      const inputId = `opt-default-${key}`;
      if (typeof val === "boolean") {
        return `
          <label for="${escapeHtml(inputId)}" class="checkbox-row">
            <span class="checkbox-label-text">${escapeHtml(key)}</span>
            <input
              type="checkbox"
              id="${escapeHtml(inputId)}"
              class="checkbox-input"
              data-default-opt-key="${escapeHtml(key)}"
              ${val ? "checked" : ""}
            />
          </label>
        `;
      }
      const inputType = typeof val === "number" ? "number" : "text";
      return `
        <div class="form-field">
          <label for="${escapeHtml(inputId)}" class="sub-label">${escapeHtml(key)}</label>
          <input
            type="${inputType}"
            id="${escapeHtml(inputId)}"
            class="input input-mono"
            data-default-opt-key="${escapeHtml(key)}"
            value="${escapeHtml(String(val))}"
          />
        </div>
      `;
    })
    .join("");
}

function addCustomOptionRow(key = "", val = "") {
  const row = document.createElement("div");
  row.className = "custom-option-row";
  const uid = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  row.innerHTML = `
    <div>
      <label for="${uid}-key" class="sr-only">Option key</label>
      <input type="text" id="${uid}-key" class="input input-mono custom-opt-key" placeholder="option_key" value="${escapeHtml(key)}" />
    </div>
    <div>
      <label for="${uid}-val" class="sr-only">Option value</label>
      <input type="text" id="${uid}-val" class="input input-mono custom-opt-val" placeholder="value" value="${escapeHtml(val)}" />
    </div>
    <button type="button" class="btn btn-ghost btn-xs remove-opt-btn" aria-label="Remove custom option">Remove</button>
  `;
  row.querySelector(".remove-opt-btn").addEventListener("click", () => row.remove());
  els.customOptionsContainer.appendChild(row);
  row.querySelector(".custom-opt-key").focus();
}

function collectRequestPayload() {
  const targets = parseTargets();
  const options = {};

  els.defaultOptionsContainer.querySelectorAll("[data-default-opt-key]").forEach((input) => {
    const key = input.getAttribute("data-default-opt-key");
    if (input.type === "checkbox") {
      options[key] = input.checked;
    } else {
      options[key] = coerceOptionValue(input.value);
    }
  });

  els.customOptionsContainer.querySelectorAll(".custom-option-row").forEach((row) => {
    const key = row.querySelector(".custom-opt-key").value.trim();
    const rawVal = row.querySelector(".custom-opt-val").value;
    if (key) {
      options[key] = coerceOptionValue(rawVal);
    }
  });

  const payload = { targets, options };
  const concurrency = Number.parseInt(els.concurrencyInput.value, 10);
  const timeout = Number.parseFloat(els.timeoutInput.value);
  const proxy = els.proxyInput.value.trim();

  if (Number.isFinite(concurrency) && concurrency > 0) payload.concurrency = concurrency;
  if (Number.isFinite(timeout) && timeout > 0) payload.timeout = timeout;
  if (proxy) payload.proxy = proxy;

  return payload;
}

/* Execution */
async function executePluginRun() {
  if (state.isRunning) return;
  if (!state.activePlugin) {
    setFeedback("Select an active plugin before running.", "error");
    return;
  }

  const payload = collectRequestPayload();
  if (payload.targets.length === 0) {
    setFeedback("Enter at least one target or click Load sample targets.", "error");
    els.targetsInput.focus();
    return;
  }

  state.isRunning = true;
  state.abortController = new AbortController();
  els.runPluginBtn.disabled = true;
  els.runBtnSpinner.hidden = false;
  els.runBtnIcon.hidden = true;
  els.abortRunBtn.hidden = false;
  setFeedback(`Running ${state.activePlugin} across ${payload.targets.length} target(s)...`);
  renderLoadingResults();

  const t0 = performance.now();
  try {
    const results = await apiFetch(`/plugins/${encodeURIComponent(state.activePlugin)}/run`, {
      method: "POST",
      body: JSON.stringify(payload),
      signal: state.abortController.signal,
    });
    const elapsedMs = Math.round(performance.now() - t0);

    const runRecord = {
      id: `${Date.now()}`,
      plugin: state.activePlugin,
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      elapsedMs,
      payload,
      resultSets: Array.isArray(results) ? results : [],
    };

    state.latestRun = runRecord;
    state.history.unshift(runRecord);
    if (state.history.length > 8) state.history.pop();

    setConnectionState("connected", "Connected · 127.0.0.1:8080");
    updateTelemetryAndResults(runRecord);
    renderHistory();
    const totalFound = runRecord.resultSets.reduce((acc, rs) => acc + (rs.results?.length || 0), 0);
    setFeedback(`Showing ${totalFound} ${totalFound === 1 ? "finding" : "findings"} across ${runRecord.resultSets.length} ${runRecord.resultSets.length === 1 ? "target" : "targets"}`, "ok");
  } catch (err) {
    if (err.name === "AbortError") {
      setFeedback("Execution aborted by user.");
      renderLatestOrEmpty();
    } else {
      setFeedback(`Run failed: ${err.message}`, "error");
      if (err.status === 502) {
        setConnectionState(
          "offline",
          "Offline · 127.0.0.1:8080",
          `${err.message} — Start with: python -m my_new_tool --server 127.0.0.1:8080`
        );
      }
      renderRunErrorState(err.message);
    }
  } finally {
    state.isRunning = false;
    state.abortController = null;
    els.runPluginBtn.disabled = false;
    els.runBtnSpinner.hidden = true;
    els.runBtnIcon.hidden = false;
    els.abortRunBtn.hidden = true;
  }
}

function renderLoadingResults() {
  els.panelResults.setAttribute("aria-busy", "true");
  els.panelResults.innerHTML = `
    <div class="loading-table-wrap">
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
    </div>
  `;
}

function renderRunErrorState(message) {
  els.panelResults.removeAttribute("aria-busy");
  els.panelResults.innerHTML = `
    <div class="empty-state">
      <h3 class="empty-title">Batch execution failed</h3>
      <p class="empty-copy">${escapeHtml(message)}</p>
      <div class="empty-actions">
        <button type="button" id="error-retry-run-btn" class="btn btn-primary btn-sm">Retry batch</button>
      </div>
    </div>
  `;
  document.getElementById("error-retry-run-btn")?.addEventListener("click", executePluginRun);
}

function computeColumns(resultSets, dedupeTarget = false) {
  const cols = [];
  for (const rs of resultSets) {
    for (const item of rs.results || []) {
      for (const key of Object.keys(item)) {
        if (key !== "error" && (!dedupeTarget || key !== "code") && !cols.includes(key)) {
          cols.push(key);
        }
      }
    }
  }
  if (!dedupeTarget) return cols;
  return cols.filter((col) => {
    let sawAny = false;
    for (const rs of resultSets) {
      const targetVal = String(rs.input?.value ?? "");
      for (const item of rs.results || []) {
        if (item[col] !== undefined) {
          sawAny = true;
          if (String(item[col]) !== targetVal) return true;
        }
      }
    }
    return !sawAny;
  });
}

function updateTelemetryAndResults(runRecord) {
  els.panelResults.removeAttribute("aria-busy");
  const resultSets = runRecord.resultSets;
  const totalTargets = resultSets.length;
  let totalFindings = 0;
  let totalErrors = 0;

  for (const rs of resultSets) {
    const items = rs.results || [];
    totalFindings += items.length;
    if (rs.error || items.some((i) => i.error)) {
      totalErrors += 1;
    }
  }

  els.metricTargets.textContent = String(totalTargets);
  els.metricFindings.textContent = String(totalFindings);
  els.metricFindings.setAttribute("data-tone", totalFindings > 0 ? "ok" : "neutral");
  els.metricErrors.textContent = String(totalErrors);
  els.metricErrors.setAttribute("data-tone", totalErrors > 0 ? "error" : "neutral");
  els.metricDuration.textContent = `${runRecord.elapsedMs} ms`;

  const hasData = totalTargets > 0;
  els.exportJsonBtn.disabled = !hasData;
  els.exportCsvBtn.disabled = !hasData;
  els.exportTxtBtn.disabled = !hasData;

  renderResultsPanel(runRecord);
}

function renderLatestOrEmpty() {
  els.panelResults.removeAttribute("aria-busy");
  if (state.latestRun) {
    renderResultsPanel(state.latestRun);
    return;
  }
  els.panelResults.innerHTML = `
    <div class="empty-state">
      <h3 class="empty-title">Ready to execute plugin batch</h3>
      <p class="empty-copy">
        Choose an OSINT plugin in the left rail, supply one or more targets above, or run a sample batch against <code>127.0.0.1:8080</code>.
      </p>
      <div class="empty-actions">
        <button type="button" id="empty-sample-run-btn" class="btn btn-primary btn-sm">Run sample batch</button>
        <button type="button" id="empty-load-sample-btn" class="btn btn-secondary btn-sm">Populate sample targets</button>
      </div>
    </div>
  `;
  bindEmptyStateButtons();
}

function renderResultsPanel(runRecord) {
  const { resultSets } = runRecord;
  if (!resultSets || resultSets.length === 0) {
    els.panelResults.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-title">Zero findings returned</h3>
        <p class="empty-copy">The plugin completed cleanly without emitting findings for the supplied targets.</p>
      </div>
    `;
    return;
  }

  if (state.activeView === "json") {
    const pretty = JSON.stringify(resultSets, null, 2);
    els.panelResults.innerHTML = `
      <div class="json-panel">
        <div class="json-panel-bar">
          <span class="muted-copy">Serialized ResultSet[] payload (${resultSets.length} target sets)</span>
          <button type="button" id="copy-raw-json-btn" class="btn btn-secondary btn-xs">Copy JSON</button>
        </div>
        <pre class="code-scroll"><code>${escapeHtml(pretty)}</code></pre>
      </div>
    `;
    document.getElementById("copy-raw-json-btn")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(pretty);
      setFeedback("Copied JSON response to clipboard.", "ok");
    });
    return;
  }

  if (state.activeView === "grouped") {
    els.panelResults.innerHTML = `
      <div class="grouped-list">
        ${resultSets
          .map((rs) => {
            const targetVal = rs.input?.value ?? "";
            const items = rs.results || [];
            const statusBadge = rs.error
              ? `<span class="badge badge-err">Error</span>`
              : `<span class="badge ${items.length > 0 ? "badge-ok" : ""}">${items.length} ${items.length === 1 ? "finding" : "findings"}</span>`;

            let inner = "";
            if (rs.error) {
              inner += `<p class="error-banner-detail"><span class="badge badge-err">Exception</span> ${escapeHtml(rs.error)}</p>`;
            }
            if (items.length === 0 && !rs.error) {
              inner += `<p class="muted-copy">No findings returned for this target.</p>`;
            } else {
              inner += items
                .map(
                  (item) => `
                  <div class="finding-kv-grid">
                    ${Object.entries(item)
                      .map(
                        ([k, v]) => `
                        <span class="finding-key">${escapeHtml(k)}</span>
                        <span class="finding-val">${k === "code" ? formatCodeBadge(v) : formatCellValue(v)}</span>
                      `
                      )
                      .join("")}
                  </div>
                `
                )
                .join("");
            }

            return `
              <article class="target-group">
                <div class="target-group-header">
                  <h3 class="target-group-title">${escapeHtml(targetVal)}</h3>
                  ${statusBadge}
                </div>
                ${inner}
              </article>
            `;
          })
          .join("")}
      </div>
    `;
    return;
  }

  /* Default: Dynamic Schema-Driven Table View (deduplicated target & unified status pill) */
  const columns = computeColumns(resultSets, true);
  const rowsHtml = [];

  for (const rs of resultSets) {
    const targetVal = rs.input?.value ?? "";
    const items = rs.results || [];

    if (rs.error && items.length === 0) {
      rowsHtml.push(`
        <tr>
          <td class="cell-target">${escapeHtml(targetVal)}</td>
          ${columns.map(() => `<td class="cell-muted">--</td>`).join("")}
          <td class="cell-nowrap"><span class="badge badge-err">${escapeHtml(rs.error)}</span></td>
        </tr>
      `);
      continue;
    }

    if (items.length === 0) {
      rowsHtml.push(`
        <tr>
          <td class="cell-target">${escapeHtml(targetVal)}</td>
          ${columns.map(() => `<td class="cell-muted">--</td>`).join("")}
          <td class="cell-nowrap"><span class="badge">0 findings</span></td>
        </tr>
      `);
      continue;
    }

    for (const item of items) {
      const rowErr = item.error || rs.error;
      let statusPill = `<span class="badge badge-ok">OK</span>`;
      if (rowErr) {
        statusPill = `<span class="badge badge-err">${escapeHtml(rowErr)}</span>`;
      } else if (item.code !== undefined && item.code !== null) {
        const codeNum = Number(item.code);
        if (codeNum >= 200 && codeNum < 300) {
          statusPill = `<span class="badge badge-ok">${codeNum} OK</span>`;
        } else {
          statusPill = formatCodeBadge(item.code);
        }
      }

      rowsHtml.push(`
        <tr>
          <td class="cell-target">${escapeHtml(targetVal)}</td>
          ${columns
            .map((col) => {
              const val = item[col];
              const strVal = val === null || val === undefined ? "" : Array.isArray(val) ? val.join(", ") : typeof val === "object" ? JSON.stringify(val) : String(val);
              let cellCls = "cell-nowrap";
              if (strVal.length > 42) {
                cellCls = /\s/.test(strVal) ? "cell-payload" : "cell-payload-unbroken";
              }
              return `<td class="${cellCls}">${formatCellValue(val)}</td>`;
            })
            .join("")}
          <td class="cell-nowrap">${statusPill}</td>
        </tr>
      `);
    }
  }

  els.panelResults.innerHTML = `
    <div class="table-scroll">
      <table class="results-table">
        <thead>
          <tr>
            <th scope="col">Target</th>
            ${columns.map((col) => `<th scope="col">${escapeHtml(col)}</th>`).join("")}
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml.join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* History */
function renderHistory() {
  if (state.history.length === 0) {
    els.historyStrip.hidden = true;
    return;
  }
  els.historyStrip.hidden = false;
  els.historyList.innerHTML = state.history
    .map((entry) => {
      const findings = entry.resultSets.reduce((acc, rs) => acc + (rs.results?.length || 0), 0);
      return `
        <button type="button" class="history-chip" data-run-id="${escapeHtml(entry.id)}">
          <span>${escapeHtml(entry.plugin)}</span>
          <span class="history-chip-meta">${entry.resultSets.length}t · ${findings}f · ${escapeHtml(entry.timestamp)}</span>
        </button>
      `;
    })
    .join("");
}

/* Exports (JSON / CSV / TXT matching my_new_tool/report.py) */
function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportResults(format) {
  if (!state.latestRun) return;
  const { plugin, resultSets } = state.latestRun;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  if (format === "json") {
    downloadBlob(`${plugin}-${stamp}.json`, JSON.stringify(resultSets, null, 2), "application/json");
    return;
  }

  if (format === "csv") {
    const cols = computeColumns(resultSets);
    const header = ["target", ...cols, "error"];
    const escapeCsv = (v) => {
      const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const lines = [header.map(escapeCsv).join(",")];
    for (const rs of resultSets) {
      const target = rs.input?.value ?? "";
      const items = rs.results || [];
      if (items.length === 0) {
        lines.push([target, ...cols.map(() => ""), rs.error || ""].map(escapeCsv).join(","));
      } else {
        for (const item of items) {
          lines.push(
            [target, ...cols.map((c) => item[c] ?? ""), item.error || rs.error || ""].map(escapeCsv).join(",")
          );
        }
      }
    }
    downloadBlob(`${plugin}-${stamp}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
    return;
  }

  if (format === "txt") {
    const blocks = resultSets.map((rs) => {
      const items = rs.results || [];
      const lines = [`Target: ${rs.input?.value ?? ""}`, `Results found: ${items.length}`];
      if (rs.error) lines.push(`Error: ${rs.error}`);
      items.forEach((item, idx) => {
        const entries = Object.entries(item);
        entries.forEach(([k, v], i) => {
          const prefix = i === 0 ? `${idx + 1}) ` : "   ";
          lines.push(`${prefix}${k}: ${v}`);
        });
      });
      lines.push("------------------------------");
      return lines.join("\n");
    });
    downloadBlob(`${plugin}-${stamp}.txt`, blocks.join("\n"), "text/plain;charset=utf-8");
  }
}

function populateSampleTargets() {
  const plugin = state.activePlugin || "default";
  const samples = SAMPLE_TARGETS[plugin] || SAMPLE_TARGETS.default;
  els.targetsInput.value = samples.join("\n");
  updateTargetCount();
  setFeedback(`Loaded ${samples.length} sample targets for ${plugin}.`);
}

function bindEmptyStateButtons() {
  document.getElementById("empty-load-sample-btn")?.addEventListener("click", () => {
    populateSampleTargets();
    els.targetsInput.focus();
  });
  document.getElementById("empty-sample-run-btn")?.addEventListener("click", () => {
    if (parseTargets().length === 0) {
      populateSampleTargets();
    }
    executePluginRun();
  });
}

/* Event Listeners */
els.pluginFilterInput.addEventListener("input", (e) => {
  state.filterQuery = e.target.value;
  renderPluginList();
});

els.mobilePluginSelect?.addEventListener("change", (e) => {
  const name = e.target.value;
  if (name && name !== state.activePlugin) {
    selectPlugin(name);
  }
});

els.pluginList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-plugin-name]");
  if (!btn) return;
  const name = btn.getAttribute("data-plugin-name");
  if (name && name !== state.activePlugin) {
    selectPlugin(name);
  }
});

els.targetsInput.addEventListener("input", updateTargetCount);

els.targetsInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    executePluginRun();
  }
});

els.loadSampleBtn.addEventListener("click", populateSampleTargets);

els.clearTargetsBtn.addEventListener("click", () => {
  els.targetsInput.value = "";
  updateTargetCount();
  els.targetsInput.focus();
});

els.importFileBtn.addEventListener("click", () => els.targetFileInput.click());

els.targetFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const content = await file.text();
  els.targetsInput.value = content.trim();
  updateTargetCount();
  setFeedback(`Imported targets from ${file.name}.`, "ok");
  els.targetFileInput.value = "";
});

els.addCustomOptionBtn.addEventListener("click", () => addCustomOptionRow());

els.runForm.addEventListener("submit", (e) => {
  e.preventDefault();
  executePluginRun();
});

els.abortRunBtn.addEventListener("click", () => {
  state.abortController?.abort();
});

els.resetDefaultsBtn.addEventListener("click", () => {
  els.customOptionsContainer.innerHTML = "";
  els.concurrencyInput.value = "10";
  els.timeoutInput.value = "100";
  els.proxyInput.value = "";
  renderDefaultOptions(state.activeSchema?.default_options || {});
  setFeedback("Reset plugin options and runtime overrides to defaults.");
});

els.copyCurlBtn.addEventListener("click", async () => {
  const plugin = state.activePlugin || "http_title";
  const payload = collectRequestPayload();
  if (payload.targets.length === 0) {
    payload.targets = SAMPLE_TARGETS[plugin] || SAMPLE_TARGETS.default;
  }
  const cmd = `curl -X POST "${BACKEND_DISPLAY}/plugins/${plugin}/run" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`;
  await navigator.clipboard.writeText(cmd);
  setFeedback("Copied cURL command to clipboard.", "ok");
});

els.copyServerCmdBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText("python -m my_new_tool --server 127.0.0.1:8080");
  setFeedback("Copied server start command to clipboard.", "ok");
});

els.retryConnectionBtn.addEventListener("click", () => loadPlugins(true));
els.refreshPluginsBtn.addEventListener("click", () => loadPlugins(true));

/* Accessible ARIA Tabs with Left/Right Arrow support */
els.viewTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    const view = tab.getAttribute("data-view");
    state.activeView = view;
    els.viewTabs.forEach((t) => {
      const active = t === tab;
      t.setAttribute("aria-selected", active ? "true" : "false");
      t.tabIndex = active ? 0 : -1;
    });
    els.panelResults.setAttribute("aria-labelledby", tab.id);
    if (state.latestRun) {
      renderResultsPanel(state.latestRun);
    }
  });

  tab.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = els.viewTabs[(index + dir + els.viewTabs.length) % els.viewTabs.length];
    next.focus();
    next.click();
  });
});

els.exportJsonBtn.addEventListener("click", () => exportResults("json"));
els.exportCsvBtn.addEventListener("click", () => exportResults("csv"));
els.exportTxtBtn.addEventListener("click", () => exportResults("txt"));

els.historyList.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-run-id]");
  if (!chip) return;
  const runId = chip.getAttribute("data-run-id");
  const found = state.history.find((h) => h.id === runId);
  if (found) {
    state.latestRun = found;
    updateTelemetryAndResults(found);
    setFeedback(`Loaded session run from ${found.timestamp}.`);
  }
});

els.clearHistoryBtn.addEventListener("click", () => {
  state.history = [];
  renderHistory();
});

/* Boot */
bindEmptyStateButtons();
updateTargetCount();
loadPlugins(false);
