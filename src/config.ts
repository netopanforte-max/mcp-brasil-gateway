import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  DB_PATH: process.env.DB_PATH || path.join(process.cwd(), 'gateway.sqlite'),
  DEFAULT_CREDITS_NEW_KEY: 100, // Créditos gratuitos padrão para novas chaves
  COST_PER_TOOL_CALL: 1, // Crédito consumido por chamada
  SERVER_NAME: 'mcp-brasil-gateway',
  SERVER_VERSION: '1.0.0',
};
