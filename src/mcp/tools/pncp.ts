import axios from 'axios';
import { z } from 'zod';

export const pncpToolSchema = {
  termo: z.string().max(100).describe('Palavra-chave para buscar licitações (ex: "ti", "notebook", "alimentação", "vigilância")'),
  uf: z.string().max(2).optional().describe('Sigla do Estado (UF) para filtrar (ex: "SP", "RJ", "DF")'),
  pagina: z.number().optional().default(1).describe('Número da página de resultados'),
};

export async function executePncpSearch(args: { termo: string; uf?: string; pagina?: number }) {
  const page = args.pagina || 1;
  const ufFilter = args.uf ? `&uf=${args.uf.toUpperCase()}` : '';
  
  // Format YYYYMMDD for today's date range
  const today = new Date();
  const dataInicial = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,10).replace(/-/g, '');
  const dataFinal = today.toISOString().slice(0,10).replace(/-/g, '');

  try {
    const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/publicas?q=${encodeURIComponent(args.termo)}&dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${page}${ufFilter}`;
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;

    if (!data.data || data.data.length === 0) {
      return {
        content: [{ type: 'text', text: `Nenhuma licitação encontrada para o termo "${args.termo}".` }],
      };
    }

    const items = data.data.slice(0, 10).map((item: any) => ({
      orgao: item.orgaoEntidade?.razaoSocial,
      objeto: item.objeto,
      modalidade: item.modalidadeNome,
      valor_total_estimado: item.valorTotalEstimado ? `R$ ${Number(item.valorTotalEstimado).toLocaleString('pt-BR')}` : 'Não informado',
      municipio_uf: `${item.unidadeOrgao?.municipioNome}/${item.unidadeOrgao?.ufSigla}`,
      data_publicacao: item.dataPublicacaoPncp,
      link_pncp: item.linkSistemaOrigem || item.uri,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify({ total_encontrados: data.totalRegistros, resultados: items }, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Erro ao buscar no PNCP: ${error.response?.data?.message || error.message}` }],
      isError: true,
    };
  }
}
