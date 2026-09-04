import { expect, test } from "@playwright/test";
import fs from "node:fs";

test.beforeAll(() => fs.mkdirSync("test-results/screenshots", { recursive: true }));

test("searches real place, opens forecast and date details", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /天气不只晴雨/ })).toBeVisible();
  const searchResponse = page.waitForResponse((response) => response.url().includes("/api/places") && response.status() === 200);
  await page.getByLabel("景区名称").fill("黄山");
  await searchResponse;
  await expect(page.getByRole("button", { name: /黄山风景区.*安徽省/ }).first()).toBeVisible();
  const forecastResponse = page.waitForResponse((response) => response.url().includes("/api/forecast") && response.status() === 200);
  await page.getByRole("button", { name: /黄山风景区.*安徽省/ }).first().click();
  await forecastResponse;
  await expect(page.getByRole("heading", { name: "黄山风景区" })).toBeVisible();
  expect(page.url()).toContain("#place=");
  await page.reload();
  await expect(page.getByRole("heading", { name: "黄山风景区" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("é»");
  await expect(page.getByText("未来最佳观景日")).toBeVisible();
  await expect(page.getByText("未来日期排行")).toBeVisible();
  await page.screenshot({ path: `test-results/screenshots/${testInfo.project.name}-detail.png`, fullPage: true });
  await page.getByRole("button", { name: /查看逐小时与评分明细/ }).click();
  await expect(page.getByText("每一分从哪里来")).toBeVisible();
  await expect(page.getByText("黄金时刻")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "逐小时天气指标" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "温度与降雨" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "温度与降雨" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "云量与湿度变化" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "云量与湿度" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "空气与紫外线" }).click();
  await expect(page.getByRole("heading", { name: "空气质量与紫外线" })).toBeVisible();
  await expect(page.getByRole("table", { name: /逐小时温度、降雨、云量/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "能见度" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "空气质量" })).toBeVisible();
  await page.screenshot({ path: `test-results/screenshots/${testInfo.project.name}-date.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("favorites, history, comparison and settings work", async ({ page }, testInfo) => {
  await page.goto("/");
  const places = page.waitForResponse((response) => response.url().includes("/api/places") && response.status() === 200);
  await page.getByLabel("景区名称").fill("乌镇"); await places;
  const forecast = page.waitForResponse((response) => response.url().includes("/api/forecast") && response.status() === 200);
  await page.getByRole("button", { name: /乌镇风景区/ }).first().click(); await forecast;
  await page.locator(".heading-actions").getByRole("button", { name: "收藏", exact: true }).click();
  await expect(page.locator(".heading-actions").getByRole("button", { name: "已收藏", exact: true })).toBeVisible();
  const checks = page.getByLabel("加入对比");
  await checks.nth(0).check(); await checks.nth(1).check();
  await page.getByRole("button", { name: /对比已选 2/ }).click();
  await expect(page.getByRole("heading", { name: "最多比较三个日期" })).toBeVisible();
  const nav = page.locator(testInfo.project.name === "mobile" ? ".bottom-nav" : ".desktop-nav");
  await nav.getByRole("button", { name: /收藏/ }).click();
  await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
  await expect(page.getByText("乌镇风景区").first()).toBeVisible();
  await nav.getByRole("button", { name: /设置/ }).click();
  await expect(page.getByRole("heading", { name: "评分说明" })).toBeVisible();
  await page.getByRole("button", { name: "10 天" }).click();
  await expect(page.getByRole("button", { name: "10 天" })).toHaveClass(/active/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "清理", exact: true }).click();
  await expect(page.getByRole("heading", { name: /天气不只晴雨/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    favorites: localStorage.getItem("scenic-weather:favorites:v1"),
    history: localStorage.getItem("scenic-weather:history:v1"),
    latest: localStorage.getItem("scenic-weather:latest:v1"),
  }))).toEqual({ favorites: null, history: null, latest: null });
});

test("queries an arbitrary China coordinate and exposes health status", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  await expect.poll(async () => (await health.json()).status).toBe("ok");

  await page.goto("/");
  const places = page.waitForResponse((response) => response.url().includes("/api/places") && response.status() === 200);
  await page.getByLabel("景区名称或坐标").fill("梅里雪山机位 28.4365,98.7071");
  await places;
  await expect(page.getByRole("button", { name: /梅里雪山机位.*精确位置/ }).first()).toBeVisible();

  const forecast = page.waitForResponse((response) => response.url().includes("/api/forecast") && response.status() === 200);
  await page.getByRole("button", { name: /梅里雪山机位.*精确位置/ }).first().click();
  await forecast;
  await expect(page.getByRole("heading", { name: "梅里雪山机位" })).toBeVisible();
  await expect(page.getByText(/精确坐标 100%/)).toBeVisible();
});
