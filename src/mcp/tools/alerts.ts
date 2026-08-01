import { z } from 'zod';
import { dbService } from '../../gateway/db.js';

export const alertsToolSchema = {
  termo: z.string().describe('Termo de busca para a licitação (ex: "segurança privada", "serviço de limpeza", "TI")'),
  email: z.string().email().describe('E-mail do cliente para receber notificações de novos editais'),
};

export async function executeRegisterAlert(apiKey: string, args: { termo: string; email: string }) {
  try {
    const result = dbService.registerAlert(apiKey, args.termo, args.email);
    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Erro ao cadastrar alerta: ${result.message}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: `Sucesso! Alerta cadastrado para o termo "${args.termo}" enviando para "${args.email}". O monitoramento está ativo 24/7.` }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Erro interno ao processar alerta: ${error.message}` }],
      isError: true,
    };
  }
}

export async function executeListAlerts(apiKey: string) {
  try {
    const alerts = dbService.listAlertsForKey(apiKey);
    if (alerts.length === 0) {
      return {
        content: [{ type: 'text', text: 'Nenhum alerta de licitação cadastrado para esta chave.' }],
      };
    }

    const formatted = alerts.map(a => `- Termo: "${a.term}" -> Destinatário: ${a.email} (Criado em: ${a.created_at})`).join('\n');
    return {
      content: [{ type: 'text', text: `Alertas de Licitação Ativos:\n${formatted}` }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Erro ao listar alertas: ${error.message}` }],
      isError: true,
    };
  }
}
