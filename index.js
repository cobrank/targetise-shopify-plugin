require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// Health check
app.get('/api/healthz', (req, res) => {
  res.json({ status: 'ok', app: 'Targetise Shopify Plugin' });
});

// Step 1: Shopify OAuth - Install
app.get('/api/shopify/install', (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');
  
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/api/shopify/callback`;
  const scopes = 'read_customers,write_customers,read_orders,read_discounts,write_discounts,write_themes';
  
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${redirectUri}`;
  
  res.redirect(installUrl);
});

// Step 2: Shopify OAuth - Callback
app.get('/api/shopify/callback', async (req, res) => {
  const { shop, code } = req.query;
  
  try {
    // Exchange code for access token
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });
    
    const accessToken = tokenRes.data.access_token;
    
    // Register publisher on Targetise
    try {
      const shopRes = await axios.get(`https://${shop}/admin/api/2026-04/shop.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      
      const shopData = shopRes.data.shop;
      
      await axios.post('https://targetise.com/api/publishers/register', {
        shop: shop,
        name: shopData.name,
        email: shopData.email,
        address: `${shopData.address1}, ${shopData.city}, ${shopData.country}`
      });
    } catch (e) {
      console.log('Targetise registration error:', e.message);
    }
    
    // Store token (in production use a database)
    global.shopTokens = global.shopTokens || {};
    global.shopTokens[shop] = accessToken;
    
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h1>✅ Targetise Installed!</h1>
        <p>Your store <strong>${shop}</strong> is now connected to the Targetise voucher network.</p>
        <p>You will receive email notifications when advertisers invite you to distribute their vouchers.</p>
        <p>Go to <a href="https://targetise.com">targetise.com</a> to manage your campaigns.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('OAuth error:', err.message);
    res.status(500).send('Installation failed: ' + err.message);
  }
});

// Step 3: Webhook from Targetise - campaign accepted
app.post('/api/webhooks/targetise', async (req, res) => {
  const signature = req.headers['x-targetise-signature'];
  const hmac = crypto.createHmac('sha256', process.env.TARGETISE_WEBHOOK_SECRET)
    .update(req.rawBody).digest('hex');
  
  if (signature !== hmac) return res.status(401).send('Unauthorized');
  
  const { event, shop, voucher_code, discount_text, advertiser_name, expires } = req.body;
  const accessToken = global.shopTokens?.[shop];
  
  if (!accessToken) return res.status(404).send('Shop not found');
  
  try {
    if (event === 'campaign.accepted') {
      await injectVoucherToEmail(shop, accessToken, {
        voucher_code, discount_text, advertiser_name, expires
      });
      res.json({ success: true, message: 'Voucher injected into invoice' });
    } else if (event === 'campaign.ended' || event === 'campaign.cancelled') {
      await removeVoucherFromEmail(shop, accessToken);
      res.json({ success: true, message: 'Voucher removed from invoice' });
    } else {
      res.json({ success: true, message: 'Event ignored' });
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Shopify app uninstalled webhook
app.post('/api/webhooks/shopify/app-uninstalled', (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  if (global.shopTokens?.[shop]) delete global.shopTokens[shop];
  res.json({ success: true });
});

// Inject voucher into order confirmation email
async function injectVoucherToEmail(shop, accessToken, voucher) {
  const headers = { 'X-Shopify-Access-Token': accessToken };
  
  const templatesRes = await axios.get(
    `https://${shop}/admin/api/2026-04/email_templates.json`,
    { headers }
  );
  
  const orderTemplate = templatesRes.data.email_templates.find(
    t => t.name === 'order_confirmation'
  );
  
  if (!orderTemplate) throw new Error('Order confirmation template not found');
  
  const voucherBlock = `
<!-- TARGETISE_VOUCHER_START -->
<div style="margin-top:30px;padding:20px;border:2px dashed #e8ff47;border-radius:8px;text-align:center;background:#f9f9f9;">
  <p style="margin:0 0 10px;font-size:14px;color:#333;">🎁 <strong>Exclusive offer from ${voucher.advertiser_name}</strong></p>
  <p style="margin:0 0 5px;font-size:24px;font-weight:bold;color:#000;letter-spacing:3px;">${voucher.voucher_code}</p>
  <p style="margin:0;font-size:13px;color:#555;">${voucher.discount_text} · Valid until ${voucher.expires}</p>
</div>
<!-- TARGETISE_VOUCHER_END -->`;

  let body = orderTemplate.body;
  body = body.replace(/<!-- TARGETISE_VOUCHER_START -->[\s\S]*<!-- TARGETISE_VOUCHER_END -->/g, '');
  body = body.replace('</body>', voucherBlock + '</body>');
  
  await axios.put(
    `https://${shop}/admin/api/2026-04/email_templates/${orderTemplate.id}.json`,
    { email_template: { id: orderTemplate.id, body } },
    { headers }
  );
}

// Remove voucher from order confirmation email
async function removeVoucherFromEmail(shop, accessToken) {
  const headers = { 'X-Shopify-Access-Token': accessToken };
  
  const templatesRes = await axios.get(
    `https://${shop}/admin/api/2026-04/email_templates.json`,
    { headers }
  );
  
  const orderTemplate = templatesRes.data.email_templates.find(
    t => t.name === 'order_confirmation'
  );
  
  if (!orderTemplate) return;
  
  let body = orderTemplate.body;
  body = body.replace(/<!-- TARGETISE_VOUCHER_START -->[\s\S]*<!-- TARGETISE_VOUCHER_END -->/g, '');
  
  await axios.put(
    `https://${shop}/admin/api/2026-04/email_templates/${orderTemplate.id}.json`,
    { email_template: { id: orderTemplate.id, body } },
    { headers }
  );
}

app.listen(PORT, () => {
  console.log(`Targetise Shopify Plugin running on port ${PORT}`);
});
