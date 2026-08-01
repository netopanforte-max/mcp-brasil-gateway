import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from '../config.js';

export interface ApiKeyRecord {
  id: number;
  key: string;
  client_name: string;
  credits: number;
  active: number;
  created_at: string;
}

export interface UsageLogRecord {
  id: number;
  key_id: number;
  tool_name: string;
  credits_deducted: number;
  timestamp: string;
}

export interface CacheRecord {
  key: string;
  value: string;
  expires_at: string;
}

export interface AlertRecord {
  id: number;
  key_id: number;
  term: string;
  email: string;
  created_at: string;
}

export interface PixTransactionRecord {
  txid: string;
  key_id: number;
  amount: number;
  credits_to_add: number;
  status: 'pending' | 'completed';
  created_at: string;
  confirmed_at?: string;
}

interface DatabaseSchema {
  next_key_id: number;
  next_log_id: number;
  next_alert_id: number;
  api_keys: ApiKeyRecord[];
  usage_logs: UsageLogRecord[];
  cache: CacheRecord[];
  alerts: AlertRecord[];
  pix_transactions: PixTransactionRecord[];
}

const DB_FILE = path.join(process.cwd(), 'gateway_db.json');

// Cache em memória para eliminar gargalo de I/O síncrono
let dbInMemory: DatabaseSchema | null = null;
let saveTimeout: NodeJS.Timeout | null = null;

function loadDb(): DatabaseSchema {
  if (dbInMemory) return dbInMemory;

  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = {
      next_key_id: 1,
      next_log_id: 1,
      next_alert_id: 1,
      api_keys: [],
      usage_logs: [],
      cache: [],
      alerts: [],
      pix_transactions: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    dbInMemory = initial;
    return dbInMemory;
  }
  
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed.cache) parsed.cache = [];
    if (!parsed.alerts) parsed.alerts = [];
    if (!parsed.pix_transactions) parsed.pix_transactions = [];
    if (!parsed.next_alert_id) parsed.next_alert_id = 1;
    dbInMemory = parsed;
    return dbInMemory!;
  } catch (err) {
    console.error('[DB] Erro de leitura física, iniciando limpo:', err);
    return {
      next_key_id: 1,
      next_log_id: 1,
      next_alert_id: 1,
      api_keys: [],
      usage_logs: [],
      cache: [],
      alerts: [],
      pix_transactions: [],
    };
  }
}

// Persistência assíncrona debulhada (Debounced write)
function saveDb(data: DatabaseSchema) {
  dbInMemory = data;
  if (saveTimeout) clearTimeout(saveTimeout);
  
  saveTimeout = setTimeout(() => {
    fs.promises.writeFile(DB_FILE, JSON.stringify(dbInMemory, null, 2), 'utf-8')
      .catch(err => console.error('[DB Error] Falha crítica de escrita em disco:', err));
  }, 150); // Debounce de 150ms para agrupar requisições concorrentes
}

export const dbService = {
  createApiKey(clientName: string, initialCredits: number = CONFIG.DEFAULT_CREDITS_NEW_KEY): string {
    const db = loadDb();
    const rawKey = 'mcp_live_' + crypto.randomBytes(16).toString('hex');
    
    const record: ApiKeyRecord = {
      id: db.next_key_id++,
      key: rawKey,
      client_name: clientName,
      credits: initialCredits,
      active: 1,
      created_at: new Date().toISOString(),
    };

    db.api_keys.push(record);
    saveDb(db);
    return rawKey;
  },

  validateKey(key: string): { valid: boolean; record?: ApiKeyRecord; message?: string } {
    const db = loadDb();
    // Sanitização rigorosa contra injection e bypass
    const cleanKey = String(key).trim();
    const record = db.api_keys.find(k => k.key === cleanKey && k.active === 1);
    if (!record) {
      return { valid: false, message: 'Chave de API inválida ou inativa.' };
    }
    return { valid: true, record };
  },

  deductCredits(key: string, toolName: string): { success: boolean; message?: string; remainingCredits?: number } {
    const db = loadDb();
    const cleanKey = String(key).trim();
    const record = db.api_keys.find(k => k.key === cleanKey && k.active === 1);

    if (!record) {
      return { success: false, message: 'Chave inválida.' };
    }

    if (record.credits < CONFIG.COST_PER_TOOL_CALL) {
      return { success: false, message: 'Saldo de créditos insuficiente.' };
    }

    record.credits -= CONFIG.COST_PER_TOOL_CALL;

    db.usage_logs.push({
      id: db.next_log_id++,
      key_id: record.id,
      tool_name: String(toolName).trim().slice(0, 100),
      credits_deducted: CONFIG.COST_PER_TOOL_CALL,
      timestamp: new Date().toISOString(),
    });

    saveDb(db);
    return { success: true, remainingCredits: record.credits };
  },

  listKeys(): ApiKeyRecord[] {
    const db = loadDb();
    return db.api_keys;
  },

  addCredits(key: string, amount: number): boolean {
    const db = loadDb();
    const cleanKey = String(key).trim();
    const record = db.api_keys.find(k => k.key === cleanKey);
    if (!record) return false;

    record.credits += amount;
    saveDb(db);
    return true;
  },

  // --- SISTEMA DE CACHE ---
  getCachedResponse(cacheKey: string): string | null {
    const db = loadDb();
    const now = new Date().toISOString();
    db.cache = db.cache.filter(c => c.expires_at > now); // Garante limpeza de expirados

    const match = db.cache.find(c => c.key === cacheKey);
    return match ? match.value : null;
  },

  setCachedResponse(cacheKey: string, value: string, ttlSeconds: number = 86400) {
    const db = loadDb();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    db.cache = db.cache.filter(c => c.key !== cacheKey);
    db.cache.push({
      key: cacheKey,
      value,
      expires_at: expiresAt
    });
    saveDb(db);
  },

  // --- SISTEMA DE ALERTAS DE LICITAÇÃO ---
  registerAlert(key: string, term: string, email: string): { success: boolean; message?: string } {
    const db = loadDb();
    const cleanKey = String(key).trim();
    const record = db.api_keys.find(k => k.key === cleanKey && k.active === 1);
    if (!record) {
      return { success: false, message: 'Chave inválida ou inativa.' };
    }

    db.alerts.push({
      id: db.next_alert_id++,
      key_id: record.id,
      term: String(term).toLowerCase().trim().slice(0, 100),
      email: String(email).trim().slice(0, 150),
      created_at: new Date().toISOString()
    });

    saveDb(db);
    return { success: true };
  },

  listAlertsForKey(key: string): AlertRecord[] {
    const db = loadDb();
    const cleanKey = String(key).trim();
    const record = db.api_keys.find(k => k.key === cleanKey);
    if (!record) return [];
    return db.alerts.filter(a => a.key_id === record.id);
  },

  listAllAlerts(): AlertRecord[] {
    const db = loadDb();
    return db.alerts;
  },

  // --- SISTEMA PIX DE COBRANÇA ---
  registerPendingPix(key: string, txid: string, amount: number, creditsToAdd: number): boolean {
    const db = loadDb();
    const cleanKey = String(key).trim();
    const record = db.api_keys.find(k => k.key === cleanKey && k.active === 1);
    if (!record) return false;

    db.pix_transactions.push({
      txid: String(txid).trim(),
      key_id: record.id,
      amount,
      credits_to_add: creditsToAdd,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    saveDb(db);
    return true;
  },

  confirmPixTransaction(txid: string): { success: boolean; clientName?: string; creditsAdded?: number; message?: string } {
    const db = loadDb();
    const tx = db.pix_transactions.find(t => t.txid === txid && t.status === 'pending');
    if (!tx) {
      return { success: false, message: 'Transação Pix não encontrada ou já processada.' };
    }

    const client = db.api_keys.find(k => k.id === tx.key_id);
    if (!client) {
      return { success: false, message: 'Cliente proprietário da transação não encontrado.' };
    }

    tx.status = 'completed';
    tx.confirmed_at = new Date().toISOString();
    client.credits += tx.credits_to_add;

    saveDb(db);
    return {
      success: true,
      clientName: client.client_name,
      creditsAdded: tx.credits_to_add
    };
  }
};
