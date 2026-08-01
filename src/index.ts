import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CONFIG } from './config.js';
import { createMcpServer } from './mcp/server.js';
import { apiKeyMiddleware } from './gateway/middleware.js';
import { dbService } from './gateway/db.js';
import { pixService } from './gateway/pixService.js';
import { executePncpSearch } from './mcp/tools/pncp.js';
import fs from 'fs';
import path from 'path';

const app = express();

app.use(cors());

// --- HEADERS DE SEGURANÇA ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const jsonParser = express.json({ limit: '10kb' });

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    server: CONFIG.SERVER_NAME,
    version: CONFIG.SERVER_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// Renderização dinâmica do arquivo HTML de Landing Page
app.get('/', (req, res) => {
  try {
    const htmlPath = path.join(process.cwd(), 'src', 'gateway', 'landing.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    res.send(html);
  } catch (err: any) {
    res.status(500).send('Erro ao carregar a página inicial do gateway.');
  }
});

// Manifesto estático server-card.json para descoberta de ferramentas do Smithery
app.get('/.well-known/mcp/server-card.json', (req, res) => {
  try {
    const cardPath = path.join(process.cwd(), 'src', 'gateway', 'server-card.json');
    const card = fs.readFileSync(cardPath, 'utf-8');
    res.setHeader('Content-Type', 'application/json');
    res.send(card);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar o manifesto server-card.json' });
  }
});

// Middleware de monetização ativado para rotas MCP (Exceções claras e seguras)
app.use((req, res, next) => {
  if (
    req.path === '/messages' ||
    req.path === '/gateway/webhook/pix' ||
    req.path === '/billing/trial-key' ||
    req.path === '/health' ||
    req.path === '/.well-known/mcp/server-card.json' ||
    req.path === '/'
  ) {
    return next();
  }
  apiKeyMiddleware(req, res, next);
});

// --- ENDPOINTS DE COBRANÇA E PIX ---

// Limitação simples de 1 chave trial por IP para evitar abuso
const trialIps = new Set<string>();

app.post('/billing/trial-key', jsonParser, (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  
  if (trialIps.has(ip)) {
    return res.status(429).json({ error: 'Você já gerou uma chave de testes gratuita neste IP.' });
  }

  const { clientName } = req.body;
  if (!clientName || typeof clientName !== 'string' || clientName.trim().length === 0) {
    return res.status(400).json({ error: 'Nome de cliente inválido.' });
  }

  const trialKey = dbService.createApiKey(clientName.trim(), 20); // 20 créditos iniciais
  trialIps.add(ip);

  console.log(`[Billing] Chave Trial gerada para IP: ${ip} | Cliente: ${clientName}`);
  res.json({ apiKey: trialKey, credits: 20 });
});

// Endpoint para gerar cobrança Pix
app.post('/billing/pix', jsonParser, (req, res) => {
  const apiKey = (req as any).apiKey;
  const { amount } = req.body;

  if (typeof amount !== 'number' || amount <= 0 || isNaN(amount)) {
    return res.status(400).json({ error: 'Parâmetro "amount" deve ser um número maior que zero.' });
  }

  const creditsToAdd = Math.floor(amount * 100);
  const clientRecord = dbService.validateKey(apiKey).record;

  const clientName = clientRecord ? clientRecord.client_name : 'Cliente';
  const { payload, txid } = pixService.generateStaticPix(amount, clientName);

  dbService.registerPendingPix(apiKey, txid, amount, creditsToAdd);

  console.log(`[Billing] Pix emitido para ${clientName}. TxID: ${txid} | Valor: R$ ${amount.toFixed(2)}`);

  res.json({
    txid,
    amount,
    credits_to_add: creditsToAdd,
    pix_copia_e_cola: payload,
    qrcode_info: "Copie o código acima e pague em seu aplicativo de banco. A liberação ocorre após a confirmação.",
  });
});

// Endpoint webhook de confirmação automática (simulação de provedor PSP)
app.post('/gateway/webhook/pix', jsonParser, (req, res) => {
  const webhookToken = req.headers['x-webhook-token'];
  const expectedToken = process.env.WEBHOOK_TOKEN || 'mcp_webhook_secure_token_123';

  if (!webhookToken || webhookToken !== expectedToken) {
    console.warn(`[Webhook Security Warning] Tentativa de acesso com token de webhook inválido de IP: ${req.ip}`);
    return res.status(403).json({ error: 'Proibido. Token do Webhook inválido.' });
  }

  const { txid, status } = req.body;

  if (!txid || status !== 'approved') {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes ou transação não aprovada.' });
  }

  const result = dbService.confirmPixTransaction(txid);

  if (!result.success) {
    return res.status(404).json({ error: result.message });
  }

  console.log(`[Billing Webhook] Pix confirmado. Créditos liberados! Cliente: ${result.clientName} | Adicionado: ${result.creditsAdded} créditos.`);
  res.json({ success: true, message: `Créditos liberados com sucesso para ${result.clientName}.` });
});

// Mapa de conexões ativas SSE combinadas com API Key correspondente
interface ActiveSession {
  transport: SSEServerTransport;
  apiKey: string;
}
const activeSessions = new Map<string, ActiveSession>();

// Endpoint SSE para iniciar sessão de comunicação com Agentes de IA
app.get('/sse', async (req, res) => {
  const apiKey = (req as any).apiKey;
  const mcpServer = createMcpServer(apiKey);
  const transport = new SSEServerTransport('/messages', res);
  
  await mcpServer.connect(transport);
  const sessionId = transport.sessionId;
  
  activeSessions.set(sessionId, { transport, apiKey });
  console.log(`[SSE Connect] Nova sessão de agente iniciada. ID: ${sessionId} (Chave: ${apiKey.slice(0, 15)}...)`);

  req.on('close', () => {
    activeSessions.delete(sessionId);
    console.log(`[SSE Disconnect] Sessão encerrada. ID: ${sessionId}`);
  });
});

// Endpoint POST para receber mensagens dos agentes de IA
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const session = activeSessions.get(sessionId);
  
  if (session) {
    await session.transport.handlePostMessage(req, res);
  } else {
    res.status(401).json({ error: 'Não autorizado. Sessão SSE expirada ou inexistente.' });
  }
});

// --- WORKER DE SEGUNDO PLANO PARA ALERTAS DE LICITAÇÃO ---
async function processAlerts() {
  console.log(`[Worker] Iniciando verificação programada de alertas de licitação...`);
  const alerts = dbService.listAllAlerts();
  
  if (alerts.length === 0) {
    console.log(`[Worker] Nenhum alerta cadastrado no momento.`);
    return;
  }

  for (const alert of alerts) {
    console.log(`[Worker] Verificando termo "${alert.term}" para e-mail "${alert.email}"...`);
    try {
      const result = await executePncpSearch({ termo: alert.term });
      
      if (!result.isError && result.content && result.content[0]?.text) {
        const data = JSON.parse(result.content[0].text);
        if (data.resultados && data.resultados.length > 0) {
          const logPath = path.join(process.cwd(), 'alerts_sent.log');
          const logMessage = `[${new Date().toISOString()}] Alerta Enviado para ${alert.email} | Termo: "${alert.term}" | Total Encontrado: ${data.total_encontrados}\n`;
          fs.appendFileSync(logPath, logMessage, 'utf-8');
          console.log(`[Worker] ✅ Novas oportunidades encontradas para o termo "${alert.term}". Log gerado em alerts_sent.log`);
        }
      }
    } catch (err: any) {
      console.error(`[Worker] Erro ao processar termo "${alert.term}": ${err.message}`);
    }
  }
}

process.on('uncaughtException', (err) => {
  console.error('[Critical Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Critical Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(CONFIG.PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 ${CONFIG.SERVER_NAME} rodando na porta ${CONFIG.PORT}`);
  console.log(`🔗 URL Local: http://localhost:${CONFIG.PORT}`);
  console.log(`===================================================`);

  processAlerts().catch(console.error);

  setInterval(() => {
    processAlerts().catch(console.error);
  }, 21600000);
});
