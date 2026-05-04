const MARKER_START = "<!-- targetise-voucher-start -->";
const MARKER_END = "<!-- targetise-voucher-end -->";

function buildVoucherBlock(voucherCode, campaignName) {
  return `${MARKER_START}
<div style="margin-top:24px;padding:16px;border:2px dashed #e0e0e0;border-radius:8px;text-align:center;font-family:sans-serif;">
  <p style="margin:0 0 8px;font-size:14px;color:#555;">Special offer just for you!</p>
  <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#222;">Use code: <span style="color:#c0392b;">${voucherCode}</span></p>
  <p style="margin:0;font-size:12px;color:#888;">Powered by ${campaignName} via Targetise</p>
</div>
${MARKER_END}`;
}

function stripVoucherBlock(html) {
  const start = html.indexOf(MARKER_START);
  const end = html.indexOf(MARKER_END);
  if (start === -1 || end === -1) return html;
  return html.slice(0, start) + html.slice(end + MARKER_END.length);
}

async function fetchOrderConfirmationTemplate(shop, accessToken) {
  const res = await fetch(
    `https://${shop}/admin/api/2025-01/email_templates.json?title=Order+confirmation`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    console.error(`[emailTemplate] Failed to fetch templates for ${shop}: ${res.status}`);
    return null;
  }

  const data = await res.json();
  return data.email_templates?.[0] || null;
}

async function updateTemplate(shop, accessToken, templateId, bodyHtml) {
  const res = await fetch(
    `https://${shop}/admin/api/2025-01/email_templates/${templateId}.json`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email_template: { body_html: bodyHtml } }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to update email template for ${shop}: ${res.status}`);
  }
}

async function injectVoucher(shop, accessToken, voucherCode, campaignName) {
  const template = await fetchOrderConfirmationTemplate(shop, accessToken);
  if (!template) return;

  const cleaned = stripVoucherBlock(template.body_html);
  const updated = cleaned.replace(
    "</body>",
    `${buildVoucherBlock(voucherCode, campaignName)}\n</body>`
  );

  await updateTemplate(shop, accessToken, template.id, updated);
  console.log(`[emailTemplate] Voucher injected for ${shop}`);
}

async function removeVoucher(shop, accessToken) {
  const template = await fetchOrderConfirmationTemplate(shop, accessToken);
  if (!template) return;

  const updated = stripVoucherBlock(template.body_html);
  await updateTemplate(shop, accessToken, template.id, updated);
  console.log(`[emailTemplate] Voucher removed for ${shop}`);
}

module.exports = { injectVoucher, removeVoucher };
