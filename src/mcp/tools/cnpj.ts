import axios from 'axios';
import { z } from 'zod';
import { dbService } from '../../gateway/db.js';

export const cnpjToolSchema = {
  cnpj: z.string().max(30).describe('Número do CNPJ da empresa (somente números ou formatado)'),
};

export async function executeCnpjLookup(args: { cnpj: string }) {
  const cleanCnpj = args.cnpj.replace(/\D/g, '');
  if (cleanCnpj.length !== 14) {
    return {
      content: [{ type: 'text', text: 'Erro: O CNPJ informado deve conter exatamente 14 dígitos.' }],
      isError: true,
    };
  }

  const cacheKey = `cnpj_${cleanCnpj}`;
  const cached = dbService.getCachedResponse(cacheKey);
  
  if (cached) {
    console.log(`[Cache Hit] Retornando dados de CNPJ do cache local: ${cleanCnpj}`);
    return {
      content: [{ type: 'text', text: cached }],
    };
  }

  try {
    const response = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, { timeout: 8000 });
    const data = response.data;

    const formattedResult = {
      razao_social: data.razao_social,
      nome_fantasia: data.nome_fantasia || 'N/A',
      cnpj: data.cnpj,
      situacao_cadastral: data.descricao_situacao_cadastral,
      data_inicio_atividade: data.data_inicio_atividade,
      cnae_principal: `${data.cnae_fiscal} - ${data.cnae_fiscal_descricao}`,
      capital_social: data.capital_social ? `R$ ${Number(data.capital_social).toLocaleString('pt-BR')}` : 'N/A',
      endereco: `${data.logradouro}, ${data.numero} - ${data.bairro}, ${data.municipio}/${data.uf} (CEP: ${data.cep})`,
      socios: data.qsa ? data.qsa.map((s: any) => `${s.nome_socio} (${s.qualificacao_socio})`) : [],
      contato: `Telefone: ${data.ddd_telefone_1 || 'N/A'} | Email: ${data.email || 'N/A'}`,
      fonte_cache: false,
    };

    const stringResult = JSON.stringify(formattedResult, null, 2);
    
    // Salvar no cache por 24 horas (86400 segundos)
    dbService.setCachedResponse(cacheKey, stringResult, 86400);

    return {
      content: [{ type: 'text', text: stringResult }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Erro ao consultar CNPJ: ${error.response?.data?.message || error.message}` }],
      isError: true,
    };
  }
}
