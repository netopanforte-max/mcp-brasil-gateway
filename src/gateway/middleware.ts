import { Request, Response, NextFunction } from 'express';
import { dbService } from './db.js';

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  // Ignorar autenticação em rotas públicas estáticas
  if (req.method === 'OPTIONS' || req.path === '/health' || req.path === '/') {
    return next();
  }

  // Tentar obter a chave via cabeçalho x-api-key, Bearer token ou Query param
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'] as string;
  const queryKey = req.query.api_key as string;

  let key = apiKeyHeader || queryKey;
  if (!key && authHeader && authHeader.startsWith('Bearer ')) {
    key = authHeader.substring(7);
  }

  if (!key) {
    return res.status(401).json({
      error: 'Acesso Negado',
      message: 'Chave de API não informada. Forneça o cabeçalho x-api-key ou parâmetro ?api_key=SUA_CHAVE.',
    });
  }

  // Validar se a chave existe e está ativa no banco
  const validation = dbService.validateKey(key);

  if (!validation.valid) {
    return res.status(401).json({
      error: 'Chave Inválida',
      message: validation.message,
    });
  }

  // Anexar chave validada no objeto request para consumo posterior
  (req as any).apiKey = key;
  next();
}
