(function () {
    const appShell = document.querySelector(".app-shell");
    const topHead = document.getElementById("top-head");
    const rootViews = {
        account: document.getElementById("view-account"),
        links: document.getElementById("view-links"),
        status: document.getElementById("view-status"),
        hook: document.getElementById("view-hook")
    };

    const emptyState = "<p class=\"empty-state\">No data yet.</p>";

    function safeJsonParse(value, fallback) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    }

    function formatDate(value) {
        const timestamp = Number(value);
        if (!timestamp || Number.isNaN(timestamp)) {
            return "Never";
        }
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return "Never";
        }
        return date.toLocaleString();
    }

    function setActiveNav(path) {
        const navLinks = document.querySelectorAll("[data-nav]");
        navLinks.forEach((link) => {
            const route = link.getAttribute("data-route");
            if (route && path.startsWith(route)) {
                link.classList.add("is-active");
            } else {
                link.classList.remove("is-active");
            }
        });
    }

    function hideAllViews() {
        Object.values(rootViews).forEach((view) => {
            view.classList.remove("is-visible");
        });
    }

    function setTitle(head, title) {
        topHead.textContent = head;
        document.title = title;
    }

    async function fetchJson(url, options) {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error("Request failed");
        }
        return response.json();
    }

    async function renderAccount() {
        setTitle("ACCOUNT", "GitHook - Account");
        hideAllViews();
        rootViews.account.classList.add("is-visible");

        const container = document.getElementById("account-data");
        container.innerHTML = "<div class=\"loading\">Loading account...</div>";

        try {
            const user = await fetchJson("/api/me");
            container.innerHTML = "";

            const card = document.createElement("div");
            card.className = "card";
            card.innerHTML = `
                <h2>Profile</h2>
                <div class="info-grid">
                    <div class="info-item"><span>Username</span><strong>${user.username || "-"}</strong></div>
                    <div class="info-item"><span>Email</span><strong>${user.email || "-"}</strong></div>
                    <div class="info-item"><span>User Number</span><strong>${user.usernumber || "-"}</strong></div>
                </div>
            `;
            container.appendChild(card);
        } catch (error) {
            container.innerHTML = "<p class=\"error-state\">Could not load your account data.</p>";
        }
    }

    async function renderLinks() {
        setTitle("URL", "GitHook - Hooks");
        hideAllViews();
        rootViews.links.classList.add("is-visible");

        const container = document.getElementById("links-data");
        container.innerHTML = "<div class=\"loading\">Loading hooks...</div>";

        try {
            const hooks = await fetchJson("/api/getallhooks");
            container.innerHTML = `
                <div class="card">
                    <div class="links-header">
                        <h2>Links</h2>
                        <button id="new-hook-btn" class="small-btn" type="button">New Hook</button>
                    </div>
                    <div id="hooks-list"></div>
                </div>
            `;

            const list = container.querySelector("#hooks-list");
            if (!hooks || hooks.length === 0) {
                list.innerHTML = emptyState;
            } else {
                const table = document.createElement("table");
                table.className = "hooks-table";
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Last Changed</th>
                            <th>Runs</th>
                            <th>Edit</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;

                const tbody = table.querySelector("tbody");
                hooks.forEach((hook) => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${hook.customName || "Unnamed hook"}</td>
                        <td>${formatDate(hook.lastEditedAt)}</td>
                        <td>${hook.timesRan || 0}</td>
                        <td><button type="button" class="small-btn edit-hook-btn" data-hook-id="${hook.hookId}">Edit</button></td>
                    `;
                    tbody.appendChild(row);
                });
                list.appendChild(table);
            }

            const newHookBtn = container.querySelector("#new-hook-btn");
            if (newHookBtn) {
                newHookBtn.addEventListener("click", async function () {
                    newHookBtn.disabled = true;
                    try {
                        const result = await fetchJson("/dashboard/newhook", { method: "POST" });
                        if (result && result.success && result.hook) {
                            navigate("/dashboard/hook/" + result.hook);
                        }
                    } catch (error) {
                        alert("Could not create a new hook right now.");
                    } finally {
                        newHookBtn.disabled = false;
                    }
                });
            }

            container.querySelectorAll(".edit-hook-btn").forEach((button) => {
                button.addEventListener("click", function () {
                    const hookId = button.getAttribute("data-hook-id");
                    navigate("/dashboard/hook/" + hookId);
                });
            });
        } catch (error) {
            container.innerHTML = "<p class=\"error-state\">Could not load your hooks.</p>";
        }
    }

    function buildPairRow(name, value) {
        const row = document.createElement("div");
        row.className = "pair-row";
        row.innerHTML = `
            <input type="text" class="pair-name" placeholder="Name" value="${name || ""}">
            <textarea class="pair-value" placeholder="Value" rows="1">${value || ""}</textarea>
            <button type="button" class="icon-btn remove-pair">Remove</button>
        `;

        const valueField = row.querySelector(".pair-value");
        const autoResize = function () {
            valueField.style.height = "auto";
            valueField.style.height = valueField.scrollHeight + "px";
        };

        valueField.addEventListener("input", autoResize);
        window.requestAnimationFrame(autoResize);
        window.addEventListener("resize", autoResize);

        row.querySelector(".remove-pair").addEventListener("click", function () {
            window.removeEventListener("resize", autoResize);
            row.remove();
        });
        return row;
    }

    function collectPairs(container) {
        const result = {};
        container.querySelectorAll(".pair-row").forEach((row) => {
            const name = row.querySelector(".pair-name").value.trim();
            const value = row.querySelector(".pair-value").value.trim();
            if (name.length > 0) {
                result[name] = value;
            }
        });
        return result;
    }

    async function renderHook(hookId) {
        setTitle("EDIT HOOK", "GitHook - Editing Hook");
        hideAllViews();
        rootViews.hook.classList.add("is-visible");

        const container = document.getElementById("hook-data");
        container.innerHTML = "<div class=\"loading\">Loading hook...</div>";

        try {
            const hook = await fetchJson("/api/gethook/" + hookId);
            const requestHeaders = safeJsonParse(hook.requestHeaders, {});
            const requestBody = safeJsonParse(hook.requestBody, {});

            container.innerHTML = `
                <form id="hook-form" class="card">
                    <h2>Hook Editor</h2>
                    <div class="hook-top-row">
                        <div class="form-row">
                            <label for="hook-name">Name</label>
                            <input id="hook-name" type="text" placeholder="Hook name">
                        </div>
                        <div class="form-row method-row">
                            <label for="hook-method">Method</label>
                            <select id="hook-method">
                                <option value="post">POST</option>
                                <option value="get">GET</option>
                                <option value="patch">PATCH</option>
                                <option value="delete">DELETE</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <label for="hook-url">URL</label>
                        <input id="hook-url" type="text" placeholder="https://example.com/webhook">
                    </div>

                    <div class="split">
                        <div class="hook-section">
                            <div class="split-head">
                                <h3>Headers</h3>
                                <button type="button" id="add-header" class="small-btn">Add</button>
                            </div>
                            <div id="headers-rows"></div>
                        </div>
                        <div class="hook-section">
                            <div class="split-head">
                                <h3>Body</h3>
                                <button type="button" id="add-body" class="small-btn">Add</button>
                            </div>
                            <div id="body-rows"></div>
                        </div>
                    </div>

                    <div class="actions">
                        <button type="submit" class="small-btn">Save Hook</button>
                    </div>
                </form>
            `;

            const method = (hook.requestMethod || "post").toLowerCase();
            const methodSelect = container.querySelector("#hook-method");
            if (["post", "get", "patch", "delete"].includes(method)) {
                methodSelect.value = method;
            }
            container.querySelector("#hook-name").value = hook.customName || "";
            container.querySelector("#hook-url").value = hook.requestUrl || "";

            const headersRows = container.querySelector("#headers-rows");
            const bodyRows = container.querySelector("#body-rows");

            Object.entries(requestHeaders).forEach(([key, value]) => {
                headersRows.appendChild(buildPairRow(key, value));
            });
            Object.entries(requestBody).forEach(([key, value]) => {
                bodyRows.appendChild(buildPairRow(key, value));
            });

            if (headersRows.children.length === 0) {
                headersRows.appendChild(buildPairRow("", ""));
            }
            if (bodyRows.children.length === 0) {
                bodyRows.appendChild(buildPairRow("", ""));
            }

            container.querySelector("#add-header").addEventListener("click", function () {
                headersRows.appendChild(buildPairRow("", ""));
            });

            container.querySelector("#add-body").addEventListener("click", function () {
                bodyRows.appendChild(buildPairRow("", ""));
            });

            const form = container.querySelector("#hook-form");
            form.addEventListener("submit", async function (event) {
                event.preventDefault();

                const payload = {
                    sendToUrl: container.querySelector("#hook-url").value.trim(),
                    customName: container.querySelector("#hook-name").value.trim(),
                    method: container.querySelector("#hook-method").value,
                    headers: collectPairs(headersRows),
                    body: collectPairs(bodyRows)
                };

                try {
                    const result = await fetchJson("/api/updatehook/" + hookId, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(payload)
                    });

                    if (result && result.success) {
                        alert("Hook updated.");
                        navigate("/dashboard/links");
                    } else {
                        alert("Failed to update hook.");
                    }
                } catch (error) {
                    alert("Failed to update hook.");
                }
            });
        } catch (error) {
            container.innerHTML = "<p class=\"error-state\">Could not load this hook.</p>";
        }
    }

    async function renderStatus() {
        setTitle("STATUS", "GitHook - Status");
        hideAllViews();
        rootViews.status.classList.add("is-visible");

        const container = document.getElementById("status-data");
        container.innerHTML = "<div class=\"loading\">Loading status...</div>";

        try {
            const hooks = await fetchJson("/api/getallhooks");
            const totals = hooks.reduce((acc, hook) => {
                acc.totalHooks += 1;
                acc.totalRuns += Number(hook.timesRan || 0);
                return acc;
            }, { totalHooks: 0, totalRuns: 0 });

            container.innerHTML = `
                <div class="stats-grid">
                    <article class="card stat-card">
                        <p>Total Hooks</p>
                        <h2>${totals.totalHooks}</h2>
                    </article>
                    <article class="card stat-card">
                        <p>Total Runs</p>
                        <h2>${totals.totalRuns}</h2>
                    </article>
                </div>
            `;
        } catch (error) {
            container.innerHTML = "<p class=\"error-state\">Could not load status data.</p>";
        }
    }

    async function route(path) {
        setActiveNav(path);

        if (path.startsWith("/dashboard/hook/")) {
            const hookId = path.split("/").pop();
            await renderHook(hookId);
            return;
        }

        if (path === "/dashboard/links") {
            await renderLinks();
            return;
        }

        if (path === "/dashboard/status") {
            await renderStatus();
            return;
        }

        await renderAccount();
    }

    function navigate(path, replace) {
        if (replace) {
            window.history.replaceState({}, "", path);
        } else {
            window.history.pushState({}, "", path);
        }
        route(path);
    }

    document.addEventListener("click", function (event) {
        const routeLink = event.target.closest("[data-route]");
        if (!routeLink) {
            return;
        }
        event.preventDefault();
        const path = routeLink.getAttribute("data-route");
        if (path) {
            navigate(path);
        }
    });

    window.addEventListener("popstate", function () {
        route(window.location.pathname);
    });

    const initialRoute = appShell && appShell.getAttribute("data-initial-route") ? appShell.getAttribute("data-initial-route") : "/dashboard/account";
    navigate(initialRoute, true);
})();
