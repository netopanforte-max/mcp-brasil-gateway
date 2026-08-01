import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CONFIG } from '../config.js';
import { dbService } from '../gateway/db.js';
import { cnpjToolSchema, executeCnpjLookup } from './tools/cnpj.js';
import { pncpToolSchema, executePncpSearch } from './tools/pncp.js';
import { fipeToolSchema, executeFipeLookup } from './tools/fipe.js';
import { alertsToolSchema, executeRegisterAlert, executeListAlerts } from './tools/alerts.js';

export function createMcpServer(apiKey: string) {
  const server = new Server(
    {
      name: CONFIG.SERVER_NAME,
      version: CONFIG.SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Listar ferramentas disponíveis
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'consulta_cnpj_enriquecida',
          description: 'Consulta dados cadastrais completos de empresas no Brasil por CNPJ (Razão Social, Sócios, Capital, Endereço, CNAE).',
          inputSchema: {
            type: 'object',
            properties: {
              cnpj: { type: 'string', description: cnpjToolSchema.cnpj.description },
            },
            required: ['cnpj'],
          },
        },
        {
          name: 'consulta_pncp_licitacoes',
          description: 'Busca oportunidades de licitações e compras públicas ativas no Brasil (PNCP) por palavra-chave e UF.',
          inputSchema: {
            type: 'object',
            properties: {
              termo: { type: 'string', description: pncpToolSchema.termo.description },
              uf: { type: 'string', description: pncpToolSchema.uf.description },
              pagina: { type: 'number', description: pncpToolSchema.pagina.description },
            },
            required: ['termo'],
          },
        },
        {
          name: 'consulta_fipe_veiculos_imoveis',
          description: 'Consulta cotação oficial da Tabela FIPE no Brasil por código FIPE.',
          inputSchema: {
            type: 'object',
            properties: {
              codigo_fipe: { type: 'string', description: fipeToolSchema.codigo_fipe.description },
            },
            required: ['codigo_fipe'],
          },
        },
        {
          name: 'cadastrar_alerta_licitacao',
          description: 'Cadastra um alerta de licitação. O servidor buscará novos editais 24/7 e notificará o e-mail cadastrado (Premium).',
          inputSchema: {
            type: 'object',
            properties: {
              termo: { type: 'string', description: alertsToolSchema.termo.description },
              email: { type: 'string', description: alertsToolSchema.email.description },
            },
            required: ['termo', 'email'],
          },
        },
        {
          name: 'listar_alertas_licitacao',
          description: 'Lista todos os alertas de licitação cadastrados e ativos vinculados a esta chave de API.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  // Executar chamada de ferramenta
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // VALIDAR E DEBITAR CRÉDITOS AQUI NO MOMENTO EXATO DA EXECUÇÃO
    const deduction = dbService.deductCredits(apiKey, name);
    if (!deduction.success) {
      return {
        content: [{ type: 'text', text: `Erro de Créditos: ${deduction.message}` }],
        isError: true,
      };
    }

    console.log(`[Billing] Cobrado 1 crédito para chave ${apiKey.slice(0, 15)}... ferramenta: ${name}`);

    switch (name) {
      case 'consulta_cnpj_enriquecida':
        return await executeCnpjLookup(args as any);
      case 'consulta_pncp_licitacoes':
        return await executePncpSearch(args as any);
      case 'consulta_fipe_veiculos_imoveis':
        return await executeFipeLookup(args as any);
      case 'cadastrar_alerta_licitacao':
        return await executeRegisterAlert(apiKey, args as any);
      case 'listar_alertas_licitacao':
        return await executeListAlerts(apiKey);
      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  });

  return server;
}
