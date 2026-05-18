import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const offenders = Array.from(document.body.querySelectorAll("*"))
      .map((element) => {
        const rect = element.getBoundingClientRect();

        return {
          className:
            element instanceof HTMLElement ? element.className.toString() : "",
          tagName: element.tagName.toLowerCase(),
          text: (element.textContent ?? "").trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      })
      .filter((rect) => rect.left < -2 || rect.right > viewportWidth + 2)
      .slice(0, 8);

    return {
      offenders,
      overflow: root.scrollWidth - root.clientWidth
    };
  });

  expect(
    result.overflow,
    `Horizontal overflow offenders: ${JSON.stringify(result.offenders, null, 2)}`
  ).toBeLessThanOrEqual(2);
}

test.describe("real estate browser smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test("portfolio page links into property dashboard without layout overflow", async ({
    page
  }) => {
    await page.goto("/real-estate?annualReportYear=2026");

    await expect(
      page.getByRole("heading", { name: "Property portfolio" })
    ).toBeVisible();
    await expect(page.getByText("Portfolio Value")).toBeVisible();
    await expect(page.getByText("$980,000")).toBeVisible();
    await expect(page.getByTestId("portfolio-annual-report-actions")).toBeVisible();
    await expect(page.getByTestId("portfolio-report-year")).toHaveValue("2026");

    const propertyCard = page.getByTestId("property-card-e2e-cedar-park-duplex");

    await expect(propertyCard).toContainText("Cedar Park Duplex");
    await expect(propertyCard).toContainText("1100 Cypress Creek Rd");
    await expect(propertyCard).toContainText("Rented");

    await expectNoHorizontalOverflow(page);
    await page
      .getByTestId("property-detail-link-e2e-cedar-park-duplex")
      .click({ force: true });

    await expect(page).toHaveURL(/\/real-estate\/e2e-cedar-park-duplex/);
    await expect(page.getByTestId("property-detail-page")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Property overview" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cedar Park Duplex" })).toBeVisible();
    await expect(
      page.getByTestId("property-detail-page").getByText("Current Value").first()
    ).toBeVisible();
    await expect(page.getByText("Performance Trends")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Monthly Review" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Financial Details" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("annual report preview downloads CSV", async ({ page }) => {
    await page.goto("/real-estate/annual-report?year=2026");

    await expect(
      page.getByRole("heading", { name: "Annual report preview" })
    ).toBeVisible();
    await expect(page.getByTestId("annual-report-preview-year")).toHaveValue("2026");
    await expect(page.getByTestId("annual-report-document")).toContainText(
      "2026 Portfolio Report"
    );
    await expect(page.getByTestId("annual-report-document")).toContainText(
      "Cedar Park Duplex"
    );

    const downloadPromise = page.waitForEvent("download");

    await page.getByTestId("annual-report-preview-csv-button").click();

    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(
      "assetboard-real-estate-2026-annual-report.csv"
    );

    const downloadPath = await download.path();

    expect(downloadPath).toBeTruthy();

    const csv = await readFile(downloadPath!, "utf8");

    expect(csv).toContain("Portfolio Summary");
    expect(csv).toContain("Property Summary");
    expect(csv).toContain("Transaction Appendix");
    expect(csv).toContain("Cedar Park Duplex");
    expect(csv).toContain("Round Rock Townhome");
    await expectNoHorizontalOverflow(page);
  });

  test("app shell navigation works from overview to real estate", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Household portfolio" })
    ).toBeVisible();
    await expect(page.getByText("Property Snapshot")).toBeVisible();

    await page.getByLabel("Open sidebar").press("Enter");
    await expect(
      page.getByRole("button", { exact: true, name: "Close sidebar" })
    ).toBeVisible();

    await page.getByRole("link", { name: "Real Estate" }).last().press("Enter");
    await expect(page).toHaveURL(/\/real-estate$/);
    await expect(
      page.getByRole("heading", { name: "Property portfolio" })
    ).toBeVisible();

    await page.getByLabel("Open sidebar").press("Enter");
    await page
      .getByRole("button", { exact: true, name: "Close sidebar" })
      .press("Enter");
    await expectNoHorizontalOverflow(page);
  });

  test("transaction rules page renders without submitting actions", async ({ page }) => {
    await page.goto("/real-estate/rules");

    await expect(page.getByTestId("transaction-rules-page")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Transaction rules" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create Rule" })).toBeVisible();
    await expect(
      page.getByRole("cell", { exact: true, name: "City utilities" })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { exact: true, name: "Property repairs" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Rule" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
