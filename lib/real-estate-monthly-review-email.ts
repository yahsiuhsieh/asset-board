export interface MonthlyReviewEmailPropertySummary {
  assetId: string;
  blockers: string[];
  error: string | null;
  missingExpenseCategoryCount: number;
  pendingExpenseTransactionCount: number;
  pendingRentCreditCount: number;
  propertyName: string;
  reviewUrl: string;
  ruleMatchedExpenseCount: number;
  status: string;
  syncedRentCount: number;
}

export interface MonthlyReviewEmailSummary {
  dryRun: boolean;
  properties: MonthlyReviewEmailPropertySummary[];
  requiresReview: boolean;
  reviewMonth: string;
}

export interface MonthlyReviewEmailRenderResult {
  html: string;
  subject: string;
  text: string;
}

export type MonthlyReviewEmailSendResult =
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getStatusLabel(status: string): string {
  if (status === "closed") {
    return "Closed";
  }

  if (status === "already_closed") {
    return "Already closed";
  }

  if (status === "would_close") {
    return "Would close";
  }

  if (status === "error") {
    return "Needs review";
  }

  return "Needs review";
}

function getStatusColor(status: string): { background: string; color: string } {
  if (status === "closed" || status === "already_closed" || status === "would_close") {
    return {
      background: "#dcfce7",
      color: "#166534"
    };
  }

  return {
    background: "#fee2e2",
    color: "#991b1b"
  };
}

function formatCount(label: string, value: number): string {
  return `${label}: ${value}`;
}

function getPropertyDetails(property: MonthlyReviewEmailPropertySummary): string[] {
  return [
    formatCount("Rent synced", property.syncedRentCount),
    formatCount("Rule-matched expenses", property.ruleMatchedExpenseCount),
    formatCount("Rent credits needing review", property.pendingRentCreditCount),
    formatCount("Expense transactions needing review", property.pendingExpenseTransactionCount),
    formatCount("Expenses missing category", property.missingExpenseCategoryCount)
  ];
}

export function getMonthlyReviewEmailSubject(
  summary: Pick<MonthlyReviewEmailSummary, "requiresReview" | "reviewMonth">
): string {
  return summary.requiresReview
    ? `AssetBoard monthly review needs review: ${summary.reviewMonth}`
    : `AssetBoard monthly review closed: ${summary.reviewMonth}`;
}

export function renderMonthlyReviewEmail(
  summary: MonthlyReviewEmailSummary
): MonthlyReviewEmailRenderResult {
  const subject = getMonthlyReviewEmailSubject(summary);
  const intro = summary.requiresReview
    ? "Some properties need manual review before the month can be closed."
    : "Monthly review completed successfully.";
  const escapedMonth = escapeHtml(summary.reviewMonth);
  const rows = summary.properties
    .map((property) => {
      const statusColor = getStatusColor(property.status);
      const blockers = property.blockers.length
        ? `<ul style="margin:8px 0 0 18px;padding:0;color:#991b1b;">${property.blockers
            .map((blocker) => `<li>${escapeHtml(blocker)}</li>`)
            .join("")}</ul>`
        : '<p style="margin:8px 0 0;color:#166534;">No blockers.</p>';
      const details = getPropertyDetails(property)
        .map((detail) => `<li>${escapeHtml(detail)}</li>`)
        .join("");

      return `
        <tr>
          <td style="padding:16px;border-top:1px solid #e5e7eb;vertical-align:top;">
            <p style="margin:0 0 6px;font-weight:700;color:#111827;">${escapeHtml(
              property.propertyName
            )}</p>
            <span style="display:inline-block;border-radius:6px;background:${statusColor.background};color:${statusColor.color};padding:3px 8px;font-size:12px;font-weight:700;">
              ${escapeHtml(getStatusLabel(property.status))}
            </span>
            ${blockers}
          </td>
          <td style="padding:16px;border-top:1px solid #e5e7eb;vertical-align:top;color:#374151;">
            <ul style="margin:0 0 12px 18px;padding:0;">${details}</ul>
            <a href="${escapeHtml(
              property.reviewUrl
            )}" style="color:#2563eb;font-weight:700;text-decoration:none;">Open monthly review</a>
          </td>
        </tr>
      `;
    })
    .join("");
  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <div style="max-width:760px;margin:0 auto;padding:28px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 6px;color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase;">AssetBoard monthly review</p>
              <h1 style="margin:0;font-size:22px;line-height:1.25;color:#111827;">${escapedMonth}</h1>
              <p style="margin:10px 0 0;color:#4b5563;">${escapeHtml(intro)}</p>
            </div>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tbody>${rows}</tbody>
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
    ...summary.properties.flatMap((property) => [
      `${property.propertyName}: ${getStatusLabel(property.status)}`,
      ...(property.blockers.length ? property.blockers.map((blocker) => `- ${blocker}`) : ["- No blockers"]),
      ...getPropertyDetails(property).map((detail) => `- ${detail}`),
      `- Review: ${property.reviewUrl}`,
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

export async function sendMonthlyReviewEmail({
  env = process.env,
  fetchImpl = fetch,
  summary
}: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  summary: MonthlyReviewEmailSummary;
}): Promise<MonthlyReviewEmailSendResult> {
  const rendered = renderMonthlyReviewEmail(summary);

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
      error: error instanceof Error ? error.message : "Could not send monthly review email.",
      status: "failed"
    };
  }
}
