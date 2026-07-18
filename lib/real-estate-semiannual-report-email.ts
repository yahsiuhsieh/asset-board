import { getAnnualQualityIssueDisplay } from "@/lib/real-estate-annual-quality-display";
import type { AnnualQualityIssue } from "@/lib/real-estate-annual-quality";

export interface SemiannualReportEmailIssueSummary {
  issue: AnnualQualityIssue;
}

export interface SemiannualReportEmailPropertySummary {
  blockingIssues: SemiannualReportEmailIssueSummary[];
  cashFlowAfterDebtService: number;
  expenseTransactionCount: number;
  noi: number;
  operatingExpenses: number;
  propertyName: string;
  rentCollected: number;
  status: "ready" | "needs_review" | "warning";
  warningIssues: SemiannualReportEmailIssueSummary[];
}

export interface SemiannualReportEmailPortfolioSummary {
  cashFlowAfterDebtService: number;
  noi: number;
  operatingExpenses: number;
  propertyCount: number;
  rentCollected: number;
  transactionCount: number;
}

export interface SemiannualReportEmailSummary {
  dryRun: boolean;
  generatedAt: string;
  periodLabel: string;
  portfolio: SemiannualReportEmailPortfolioSummary;
  properties: SemiannualReportEmailPropertySummary[];
  reportUrl: string;
  requiresReview: boolean;
  throughMonth: string | null;
  year: string;
}

export interface SemiannualReportEmailRenderResult {
  html: string;
  subject: string;
  text: string;
}

export type SemiannualReportEmailSendResult =
  | {
      html: string;
      status: "dry_run" | "skipped";
      subject: string;
      text: string;
      warning: string;
    }
  | {
      id: string | null;
      status: "sent";
      subject: string;
    }
  | {
      error: string;
      html: string;
      status: "failed";
      subject: string;
      text: string;
    };

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency"
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function getStatusLabel(
  status: SemiannualReportEmailPropertySummary["status"]
): string {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "warning") {
    return "Ready with warnings";
  }

  return "Needs review";
}

function getStatusColor(
  status: SemiannualReportEmailPropertySummary["status"]
): { background: string; color: string } {
  if (status === "ready") {
    return {
      background: "#dcfce7",
      color: "#166534"
    };
  }

  if (status === "warning") {
    return {
      background: "#fef3c7",
      color: "#92400e"
    };
  }

  return {
    background: "#fee2e2",
    color: "#991b1b"
  };
}

function renderIssueList(
  title: string,
  issues: SemiannualReportEmailIssueSummary[],
  color: string
): string {
  if (issues.length === 0) {
    return "";
  }

  const items = issues
    .map(({ issue }) => {
      const display = getAnnualQualityIssueDisplay(issue);
      const meta = display.meta ? ` (${display.meta})` : "";

      return `<li>${escapeHtml(display.title)}: ${escapeHtml(
        display.detail
      )}${escapeHtml(meta)}</li>`;
    })
    .join("");

  return `<p style="margin:10px 0 4px;font-size:12px;font-weight:700;color:${color};">${escapeHtml(
    title
  )}</p><ul style="margin:0 0 0 18px;padding:0;color:${color};">${items}</ul>`;
}

function getPropertyMetrics(
  property: SemiannualReportEmailPropertySummary
): Array<{ label: string; value: string }> {
  return [
    {
      label: "Rent collected",
      value: formatCurrency(property.rentCollected)
    },
    {
      label: "Operating expenses",
      value: formatCurrency(property.operatingExpenses)
    },
    {
      label: "NOI",
      value: formatCurrency(property.noi)
    },
    {
      label: "Cash flow after debt",
      value: formatCurrency(property.cashFlowAfterDebtService)
    },
    {
      label: "Expense transactions",
      value: String(property.expenseTransactionCount)
    }
  ];
}

export function getSemiannualReportEmailSubject(
  summary: Pick<SemiannualReportEmailSummary, "periodLabel" | "requiresReview">
): string {
  return summary.requiresReview
    ? `Annual Report Needs Review: ${summary.periodLabel}`
    : `Annual Report Ready: ${summary.periodLabel}`;
}

export function renderSemiannualReportEmail(
  summary: SemiannualReportEmailSummary
): SemiannualReportEmailRenderResult {
  const subject = getSemiannualReportEmailSubject(summary);
  const intro = summary.requiresReview
    ? "Annual report output needs manual review before it is ready."
    : "Annual report output is ready for review.";
  const portfolioMetrics = [
    ["Properties", String(summary.portfolio.propertyCount)],
    ["Rent collected", formatCurrency(summary.portfolio.rentCollected)],
    ["Operating expenses", formatCurrency(summary.portfolio.operatingExpenses)],
    ["NOI", formatCurrency(summary.portfolio.noi)],
    [
      "Cash flow after debt",
      formatCurrency(summary.portfolio.cashFlowAfterDebtService)
    ],
    ["Transactions", String(summary.portfolio.transactionCount)]
  ];
  const portfolioHtml = portfolioMetrics
    .map(
      ([label, value]) => `
        <td style="padding:12px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:700;">${escapeHtml(
            label
          )}</p>
          <p style="margin:0;color:#111827;font-size:16px;font-weight:700;">${escapeHtml(
            value
          )}</p>
        </td>
      `
    )
    .join("");
  const propertyRows = summary.properties
    .map((property) => {
      const statusColor = getStatusColor(property.status);
      const metrics = getPropertyMetrics(property)
        .map(
          (metric) =>
            `<li>${escapeHtml(metric.label)}: ${escapeHtml(metric.value)}</li>`
        )
        .join("");
      const blockingIssues = renderIssueList(
        "Blocking issues",
        property.blockingIssues,
        "#991b1b"
      );
      const warningIssues = renderIssueList(
        "Warnings",
        property.warningIssues,
        "#92400e"
      );
      const issueFallback =
        !blockingIssues && !warningIssues
          ? '<p style="margin:10px 0 0;color:#166534;">No report issues.</p>'
          : "";

      return `
        <tr>
          <td style="padding:16px;border-top:1px solid #e5e7eb;vertical-align:top;">
            <p style="margin:0 0 6px;font-weight:700;color:#111827;">${escapeHtml(
              property.propertyName
            )}</p>
            <span style="display:inline-block;border-radius:6px;background:${statusColor.background};color:${statusColor.color};padding:3px 8px;font-size:12px;font-weight:700;">
              ${escapeHtml(getStatusLabel(property.status))}
            </span>
            ${blockingIssues}
            ${warningIssues}
            ${issueFallback}
          </td>
          <td style="padding:16px;border-top:1px solid #e5e7eb;vertical-align:top;color:#374151;">
            <ul style="margin:0 0 12px 18px;padding:0;">${metrics}</ul>
          </td>
        </tr>
      `;
    })
    .join("");
  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <div style="max-width:820px;margin:0 auto;padding:28px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 6px;color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase;">AssetBoard annual report</p>
              <h1 style="margin:0;font-size:22px;line-height:1.25;color:#111827;">${escapeHtml(
                summary.periodLabel
              )}</h1>
              <p style="margin:10px 0 0;color:#4b5563;">${escapeHtml(intro)}</p>
              <p style="margin:14px 0 0;">
                <a href="${escapeHtml(
                  summary.reportUrl
                )}" style="display:inline-block;border-radius:6px;background:#2563eb;color:#ffffff;padding:10px 14px;font-size:14px;font-weight:700;text-decoration:none;">Open Annual Report</a>
              </p>
            </div>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tbody>
                <tr>${portfolioHtml}</tr>
              </tbody>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tbody>${propertyRows}</tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
  const textLines = [
    subject,
    "",
    intro,
    "",
    `Report: ${summary.reportUrl}`,
    "",
    "Portfolio",
    ...portfolioMetrics.map(([label, value]) => `- ${label}: ${value}`),
    "",
    ...summary.properties.flatMap((property) => [
      `${property.propertyName}: ${getStatusLabel(property.status)}`,
      ...getPropertyMetrics(property).map(
        (metric) => `- ${metric.label}: ${metric.value}`
      ),
      ...property.blockingIssues.map(({ issue }) => {
        const display = getAnnualQualityIssueDisplay(issue);

        return `- Blocking: ${display.title}: ${display.detail}`;
      }),
      ...property.warningIssues.map(({ issue }) => {
        const display = getAnnualQualityIssueDisplay(issue);

        return `- Warning: ${display.title}: ${display.detail}`;
      }),
      ""
    ])
  ];

  return {
    html,
    subject,
    text: textLines.join("\n").trim()
  };
}

function getMissingEmailEnv(env: NodeJS.ProcessEnv): string[] {
  return [
    "RESEND_API_KEY",
    "MONTHLY_REVIEW_NOTIFY_EMAIL_TO",
    "MONTHLY_REVIEW_NOTIFY_EMAIL_FROM",
    "ASSETBOARD_APP_URL"
  ].filter((name) => !env[name]?.trim());
}

export async function sendSemiannualReportEmail({
  env = process.env,
  fetchImpl = fetch,
  summary
}: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  summary: SemiannualReportEmailSummary;
}): Promise<SemiannualReportEmailSendResult> {
  const rendered = renderSemiannualReportEmail(summary);

  if (summary.dryRun) {
    return {
      ...rendered,
      status: "dry_run",
      warning: "Dry run: email was not sent."
    };
  }

  const missingEnv = getMissingEmailEnv(env);

  if (missingEnv.length > 0) {
    return {
      ...rendered,
      status: "skipped",
      warning: `Email was not sent because env vars are missing: ${missingEnv.join(", ")}.`
    };
  }

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: env.MONTHLY_REVIEW_NOTIFY_EMAIL_FROM,
        html: rendered.html,
        subject: rendered.subject,
        text: rendered.text,
        to: env.MONTHLY_REVIEW_NOTIFY_EMAIL_TO
      }),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const responseBody = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      id?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      return {
        ...rendered,
        error:
          responseBody?.error?.message ??
          responseBody?.message ??
          `Resend request failed with status ${response.status}.`,
        status: "failed"
      };
    }

    return {
      id: responseBody?.id ?? null,
      status: "sent",
      subject: rendered.subject
    };
  } catch (error) {
    return {
      ...rendered,
      error:
        error instanceof Error
          ? error.message
          : "Could not send semiannual report email.",
      status: "failed"
    };
  }
}
