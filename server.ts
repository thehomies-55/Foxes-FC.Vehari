import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RecipientInput {
  playerId: string;
  playerName: string;
  instagramId: string;
}

interface DeliveryResult {
  playerId: string;
  playerName: string;
  instagramId: string;
  sent: boolean;
  detail: string;
}

async function createServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  app.get('/api/instagram/status', (_req, res) => {
    const token = process.env.IG_ACCESS_TOKEN || '';
    const bizId = process.env.IG_BUSINESS_ACCOUNT_ID || '';
    res.json({
      configured: Boolean(token.trim() && bizId.trim()),
      hasToken: Boolean(token.trim()),
      hasBusinessId: Boolean(bizId.trim()),
    });
  });

  app.post('/api/instagram/send-match-alert', async (req, res) => {
    const token = (process.env.IG_ACCESS_TOKEN || '').trim();
    const bizId = (process.env.IG_BUSINESS_ACCOUNT_ID || '').trim();
    const body = req.body as {
      hostIgId?: string;
      messageText?: string;
      recipients?: RecipientInput[];
    };

    const messageText = (body?.messageText || '').trim();
    const recipients = Array.isArray(body?.recipients) ? body.recipients : [];

    if (!messageText || recipients.length === 0) {
      res.status(400).json({
        error: 'Message text and at least one player Instagram recipient are required.',
      });
      return;
    }

    if (!token || !bizId) {
      res.json({
        configured: false,
        mode: 'assisted_dispatch',
        reason:
          'Automated server-side Instagram DM delivery requires IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID from a Meta Instagram Professional account. Use the Assisted DM Queue below to send directly from Fox Instagram.',
        results: [] as DeliveryResult[],
      });
      return;
    }

    const results: DeliveryResult[] = [];
    for (const recipient of recipients) {
      const cleanRecipient = recipient.instagramId.replace(/^@/, '').trim();
      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(bizId)}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              recipient: { id: cleanRecipient },
              message: { text: messageText },
            }),
          }
        );

        const data = (await response.json()) as { error?: { message?: string }; message_id?: string };
        if (response.ok) {
          results.push({
            playerId: recipient.playerId,
            playerName: recipient.playerName,
            instagramId: recipient.instagramId,
            sent: true,
            detail: data.message_id ? `Delivered (ID: ${data.message_id})` : 'Delivered via Meta API',
          });
        } else {
          results.push({
            playerId: recipient.playerId,
            playerName: recipient.playerName,
            instagramId: recipient.instagramId,
            sent: false,
            detail: data.error?.message || `Meta API HTTP ${response.status}`,
          });
        }
      } catch (err) {
        results.push({
          playerId: recipient.playerId,
          playerName: recipient.playerName,
          instagramId: recipient.instagramId,
          sent: false,
          detail: err instanceof Error ? err.message : 'Network error calling Meta Graph API',
        });
      }
    }

    res.json({
      configured: true,
      mode: 'meta_graph_api',
      results,
    });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Foxes FC.vehari server running on http://0.0.0.0:${port}`);
  });
}

createServer();
