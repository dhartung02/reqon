// ---------------------------------------------------------------------------
// Brevo (ex-Sendinblue) client — contact capture + transactional email for the early-access
// waitlist and beta invites. Uses Brevo REST API v3 over Node's stdlib https (no new dependency).
//
// Config (env): BREVO_API_KEY (required to do anything; everything no-ops cleanly when unset, so
// dev/self-host works without Brevo), BREVO_SENDER_EMAIL + BREVO_SENDER_NAME (a verified sender),
// BREVO_WAITLIST_LIST_ID + BREVO_BETA_LIST_ID (contact lists), and optional template ids
// BREVO_TPL_CONFIRM / BREVO_TPL_INVITE (else we send inline HTML).
//   - Send email:   POST https://api.brevo.com/v3/smtp/email   (header: api-key)
//   - Upsert contact:POST https://api.brevo.com/v3/contacts
//   - Add to list:  POST https://api.brevo.com/v3/contacts/lists/{id}/contacts/add
// ---------------------------------------------------------------------------
'use strict';
const https = require('https');

const HOST = 'api.brevo.com';
const key = () => process.env.BREVO_API_KEY || '';
const configured = () => !!key();
const sender = () => ({ email: process.env.BREVO_SENDER_EMAIL || '', name: process.env.BREVO_SENDER_NAME || 'Reqon' });
const waitlistListId = () => parseInt(process.env.BREVO_WAITLIST_LIST_ID || '', 10) || null;
const betaListId = () => parseInt(process.env.BREVO_BETA_LIST_ID || '', 10) || null;

function request(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = https.request(
      { host: HOST, path: apiPath, method, headers: {
        'api-key': key(), accept: 'application/json', 'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      } },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          let json = null; try { json = data ? JSON.parse(data) : {}; } catch (e) { /* non-JSON */ }
          if (ok) return resolve(json || {});
          // 400 "Contact already exist" is fine for our upsert intent.
          const msg = (json && (json.message || json.code)) || data || ('HTTP ' + res.statusCode);
          reject(new Error('Brevo ' + res.statusCode + ': ' + String(msg).slice(0, 200)));
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Create/update a contact; optionally add to a list. Best-effort — callers should not block signup
// on a Brevo failure. Returns { skipped } when Brevo isn't configured.
async function upsertContact({ email, attributes, listIds }) {
  if (!configured()) return { skipped: 'brevo-unconfigured' };
  return request('POST', '/v3/contacts', {
    email: String(email).toLowerCase().trim(),
    attributes: attributes || {},
    listIds: (listIds || []).filter(Boolean),
    updateEnabled: true,
  });
}

async function addToList(email, listId) {
  if (!configured() || !listId) return { skipped: true };
  return request('POST', '/v3/contacts/lists/' + listId + '/contacts/add', { emails: [String(email).toLowerCase().trim()] });
}

// Send a transactional email — templateId + params (preferred, edit copy in Brevo) OR subject+htmlContent.
async function sendEmail({ to, toName, subject, htmlContent, templateId, params }) {
  if (!configured()) return { skipped: 'brevo-unconfigured' };
  const s = sender();
  if (!s.email) return { skipped: 'no-sender' };
  const body = { sender: s, to: [{ email: to, name: toName || undefined }] };
  if (templateId) { body.templateId = Number(templateId); if (params) body.params = params; }
  else { body.subject = subject; body.htmlContent = htmlContent; }
  return request('POST', '/v3/smtp/email', body);
}

module.exports = { configured, sender, waitlistListId, betaListId, upsertContact, addToList, sendEmail };
