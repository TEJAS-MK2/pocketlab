import { expect, test } from "@playwright/test";

test("loads the lab, simulates ping, and shows the packet event", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Network studio" })).toBeVisible();
  await page.getByRole("button", { name: "Run ping simulation" }).click();
  await page.getByRole("button", { name: /Packets/ }).click();
  await expect(page.getByText("delivered", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/ICMP echo reply received from 192\.168\.10\.20/)).toBeVisible();
  await expect(page.locator(".canvas-device.on-path")).toHaveCount(3);
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
  await expect(page.getByRole("button", { name: "Select WORKSTATION-01" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select WEB-SERVER" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("packetlab.workspace.v1"))).toBe(before);
});

test("backs up corrupted local storage without overwriting the original", async ({ page }) => {
  const corrupted = "{not-valid-json";
  await page.addInitScript((raw) => {
    localStorage.setItem("packetlab.workspace.v1", raw);
  }, corrupted);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Select WORKSTATION-01" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select WEB-SERVER" })).toBeVisible();
  await expect(page.getByText(/raw data backed up under packetlab\.workspace\.v1\.invalid-backup/i)).toBeVisible();
  const saved = await page.evaluate(() => ({
    original: localStorage.getItem("packetlab.workspace.v1"),
    backup: localStorage.getItem("packetlab.workspace.v1.invalid-backup")
  }));
  expect(saved.original).toBe(corrupted);
  expect(saved.backup).toBe(corrupted);
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

test("firewall deny rules drop simulated traffic and can be lifted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Allowing" }).nth(2).click();
  await page.getByRole("button", { name: "Run ping simulation" }).click();
  await expect(page.getByText(/Blocked by simulated firewall policy for WEB-SERVER/)).toBeVisible();
  await page.getByRole("button", { name: /Overview/ }).click();
  await page.getByRole("button", { name: "Blocked" }).click();
  await page.getByRole("button", { name: "Run ping simulation" }).click();
  await expect(page.getByText(/ICMP echo reply received from 192\.168\.10\.20/)).toBeVisible();
});
