import { expect, test } from "@playwright/test";

test("loads the lab, simulates ping, and shows the packet event", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Network studio" })).toBeVisible();
  await page.getByRole("button", { name: "Run ping simulation" }).click();
  await page.getByRole("button", { name: /Packets/ }).click();
  await expect(page.getByText("delivered", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/ICMP echo reply received from 192\.168\.10\.20/)).toBeVisible();
  await expect(page.locator(".canvas-device.on-path")).toHaveCount(3);
  const pathTrace = page.locator('[aria-label="Simulated packet path"] .event-trace-hop');
  await expect(pathTrace).toHaveCount(3);
  await expect(pathTrace.nth(0)).toContainText("WORKSTATION-01");
  await expect(pathTrace.nth(1)).toContainText("EDGE-ROUTER");
  await expect(pathTrace.nth(2)).toContainText("WEB-SERVER");
});

test("guided progress follows device edits, persists locally, and supports export/reset", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Device name").fill("LAB-CLIENT");
  await page.getByLabel("IPv4 address").fill("10.5.0.10");
  await page.getByRole("button", { name: /^Save$/ }).click();
  await expect(page.getByRole("button", { name: "Select LAB-CLIENT" })).toBeVisible();

  const objectives = page.locator(".mission-objective");
  await objectives.nth(0).getByRole("button", { name: "Run ping" }).click();
  await expect(page.getByText("1/4 COMPLETE")).toBeVisible();
  await objectives.nth(1).getByRole("button", { name: "Trace route" }).click();
  await expect(page.getByText("2/4 COMPLETE")).toBeVisible();
  await expect(page.getByText("Route: LAB-CLIENT -> EDGE-ROUTER -> WEB-SERVER", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("2/3 COMPLETE")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export progress" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("packetlab-mission-progress.json");

  await page.getByRole("button", { name: "Reset progress" }).click();
  await expect(page.getByText("0/4 COMPLETE")).toBeVisible();
  const savedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem("packetlab.mission-progress.v1")!));
  expect(savedProgress).toEqual({ version: 1, pingDone: false, routeDone: false, subnetDone: false, firewallDone: false });
});

test("does not award the route objective when the topology has no route", async ({ page }) => {
  await page.goto("/");
  const objectives = page.locator(".mission-objective");
  await objectives.nth(0).getByRole("button", { name: "Run ping" }).click();
  await expect(page.getByText("1/3 COMPLETE")).toBeVisible();

  // The ping objective switches the inspector to Packets; return to Overview to edit links.
  await page.getByRole("button", { name: /Overview/ }).click();
  await page.getByRole("button", { name: "Remove link ln-01" }).click();
  await page.getByRole("button", { name: "Remove link ln-02" }).click();
  const terminal = page.getByLabel("Virtual terminal command");
  await terminal.fill("route ws-01 srv-01");
  await terminal.press("Enter");

  await expect(page.getByText("No simulated route between those devices.", { exact: true })).toBeVisible();
  await expect(page.getByText("1/3 COMPLETE")).toBeVisible();
  await expect(page.getByText("2/3 COMPLETE")).toHaveCount(0);
});

test("guided firewall objective requires a real simulated policy drop", async ({ page }) => {
  await page.goto("/");
  const firewallObjective = page.locator(".mission-objective").nth(3);
  await firewallObjective.getByRole("button", { name: "Run check" }).click();
  await expect(page.getByText("Block WEB-SERVER in the simulated firewall, then run this check again")).toBeVisible();
  await expect(page.getByText("0/4 COMPLETE")).toBeVisible();

  await page.getByRole("button", { name: "Allowing" }).nth(2).click();
  await firewallObjective.getByRole("button", { name: "Run check" }).click();
  await expect(page.getByText(/Blocked by simulated firewall policy for WEB-SERVER/)).toBeVisible();
  await expect(page.getByText("1/4 COMPLETE")).toBeVisible();
  const savedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem("packetlab.mission-progress.v1")!));
  expect(savedProgress.firewallDone).toBe(true);
  expect(savedProgress.pingDone).toBe(false);
});

test("searches packet traces and exports a packet-event report", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run ping simulation" }).click();
  await page.getByRole("button", { name: /Packets/ }).click();
  const search = page.getByLabel("Filter packet events");
  await search.fill("edge-router");
  await expect(page.locator(".packet-event")).toHaveCount(1);
  await expect(page.locator(".packet-event")).toContainText("EDGE-ROUTER");
  await search.fill("no-such-device");
  await expect(page.getByText("No matching events")).toBeVisible();
  await search.fill("WEB-SERVER");
  await expect(page.locator(".packet-event")).toContainText("WEB-SERVER");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("packetlab-packet-events.json");
});

test("supports simulated route, DNS, and HTTP terminal commands", async ({ page }) => {
  await page.goto("/");
  const terminal = page.getByLabel("Virtual terminal command");
  await terminal.fill("route ws-01 srv-01");
  await terminal.press("Enter");
  await expect(page.getByText(/Route: WORKSTATION-01 -> EDGE-ROUTER -> WEB-SERVER/)).toBeVisible();
  await expect(page.getByText(/Hop 01.*WORKSTATION-01/)).toBeVisible();
  await terminal.fill("table ws-01");
  await terminal.press("Enter");
  await expect(page.getByText(/Routing table for WORKSTATION-01/)).toBeVisible();
  await terminal.fill("dns srv-01");
  await terminal.press("Enter");
  await expect(page.getByText(/web-server\.lab -> 192\.168\.10\.20/)).toBeVisible();
  await terminal.fill("http srv-01");
  await terminal.press("Enter");
  await expect(page.getByText("HTTP/1.1 200 OK")).toBeVisible();
});

test("edits a device and restores it from local browser storage", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Device name").fill("CLIENT-RENAMED");
  await page.getByRole("button", { name: /^Save$/ }).click();
  await expect(page.getByRole("button", { name: "Select CLIENT-RENAMED" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Select CLIENT-RENAMED" })).toBeVisible();
});

test("calculates a subnet and preserves the current lab after malformed import", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("IPv4 network / prefix").fill("10.20.30.4/24");
  await expect(page.getByText("10.20.30.0/24")).toBeVisible();
  await expect(page.getByText("254", { exact: true })).toBeVisible();

  const before = await page.evaluate(() => localStorage.getItem("packetlab.workspace.v1"));
  await expect(page.getByRole("button", { name: "Select WORKSTATION-01" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select WEB-SERVER" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid-lab.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 99, devices: [], links: [] }))
  });
  await expect(page.getByText(/Unsupported lab format/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "oversized-lab.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_000_001, 0x20)
  });
  await expect(page.getByText("Lab files must be smaller than 1 MB.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Select WORKSTATION-01" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select WEB-SERVER" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("packetlab.workspace.v1"))).toBe(before);
});

test("requires confirmation before replacing a modified workspace", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Device name").fill("CLIENT-RENAMED");
  await page.getByRole("button", { name: /^Save$/ }).click();
  const before = await page.evaluate(() => localStorage.getItem("packetlab.workspace.v1"));
  await expect(page.getByRole("button", { name: "Select CLIENT-RENAMED" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset lab" }).click();
  await expect(page.getByRole("button", { name: "Select CLIENT-RENAMED" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("packetlab.workspace.v1"))).toBe(before);
  await expect(page.getByText(/Reset cancelled/)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset lab" }).click();
  await expect(page.getByRole("button", { name: "Select WORKSTATION-01" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select CLIENT-RENAMED" })).toHaveCount(0);
});

test("backs up corrupted local storage without overwriting the original", async ({ page }) => {
  const corrupted = "{not-valid-json";
  const corruptedProgress = "{not-valid-progress";
  await page.addInitScript(({ workspace, mission }) => {
    localStorage.setItem("packetlab.workspace.v1", workspace);
    localStorage.setItem("packetlab.mission-progress.v1", mission);
  }, { workspace: corrupted, mission: corruptedProgress });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Select WORKSTATION-01" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select WEB-SERVER" })).toBeVisible();
  await expect(page.getByText(/raw data backed up under packetlab\.workspace\.v1\.invalid-backup/i)).toBeVisible();
  const saved = await page.evaluate(() => ({
    original: localStorage.getItem("packetlab.workspace.v1"),
    backup: localStorage.getItem("packetlab.workspace.v1.invalid-backup"),
    missionOriginal: localStorage.getItem("packetlab.mission-progress.v1"),
    missionBackup: localStorage.getItem("packetlab.mission-progress.v1.invalid-backup")
  }));
  expect(saved.original).toBe(corrupted);
  expect(saved.backup).toBe(corrupted);
  expect(saved.missionOriginal).toBe(corruptedProgress);
  expect(saved.missionBackup).toBe(corruptedProgress);
});

test("reopens the built app shell when the browser goes offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Service worker did not control the page")), 8000);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
  });
  const cachedAssets = await page.evaluate(async () => {
    const cache = await caches.open("packetlab-shell-v3");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedAssets.some((path) => path.endsWith(".js"))).toBe(true);
  expect(cachedAssets.some((path) => path.endsWith(".css"))).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Network studio" })).toBeVisible();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Network studio" })).toBeVisible();
  await context.setOffline(false);
});


test("moves a device and persists its topology position", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset lab" }).click();
  const device = page.getByRole("button", { name: "Select WORKSTATION-01" });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("packetlab.workspace.v1")!).devices[0].x as number);
  const box = await device.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 70, box!.y + box!.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("packetlab.workspace.v1")!).devices[0].x as number)).toBeGreaterThan(before + 5);
});

test("keeps buttons and form fields accessible by name and announces notices", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.locator("#main-content")).toBeVisible();

  const unnamedButtons = await page.locator("button").evaluateAll((buttons) =>
    buttons.filter((button) =>
      !button.getAttribute("aria-label")?.trim() &&
      !button.getAttribute("aria-labelledby")?.trim() &&
      !button.innerText.trim()
    ).map((button) => button.outerHTML)
  );
  expect(unnamedButtons).toEqual([]);

  const unlabeledInputs = await page.locator('input:not([type="file"]):not([type="hidden"])').evaluateAll((inputs) =>
    inputs.filter((input) =>
      !input.getAttribute("aria-label")?.trim() &&
      !input.getAttribute("aria-labelledby")?.trim() &&
      !(input.labels && input.labels.length > 0)
    ).map((input) => input.outerHTML)
  );
  expect(unlabeledInputs).toEqual([]);
  await expect(page.locator('.inspector-footer [role="status"]')).toHaveAttribute("aria-live", "polite");
  await expect(page.locator('.inspector-footer [role="status"]')).toHaveAttribute("aria-atomic", "true");
});

test("moves a device with the keyboard and persists the new position", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset lab" }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("packetlab.workspace.v1")!).devices[0].x as number);
  const device = page.getByRole("button", { name: "Select WORKSTATION-01" });
  await device.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("packetlab.workspace.v1")!).devices[0].x as number)).toBeGreaterThan(before);
  await expect(page.getByText("Topology position moved with keyboard")).toBeVisible();
});

test("keeps the main workflow within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Network studio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run ping simulation" })).toBeVisible();
  await expect(page.getByLabel("Virtual terminal command")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test("firewall deny rules drop simulated traffic, count hits, and can be lifted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Allowing" }).nth(2).click();
  await page.getByRole("button", { name: "Run ping simulation" }).click();
  await expect(page.getByText(/Blocked by simulated firewall policy for WEB-SERVER/)).toBeVisible();
  const terminal = page.getByLabel("Virtual terminal command");
  await terminal.fill("http srv-01");
  await terminal.press("Enter");
  await expect(page.getByText("Connection failed: blocked by simulated firewall policy.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Overview/ }).click();
  await expect(page.getByText("1 logged hit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Blocked" }).click();
  await page.getByRole("button", { name: "Run ping simulation" }).click();
  await expect(page.getByText(/ICMP echo reply received from 192[.]168[.]10[.]20/)).toBeVisible();
  await page.getByRole("button", { name: /Packets/ }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: /Overview/ }).click();
  await expect(page.locator(".firewall-hit-count")).toHaveText(["0 logged hits", "0 logged hits", "0 logged hits"]);
});;
