import axios from 'axios';
import { z } from 'zod';
import { dbService } from '../../gateway/db.js';

export const fipeToolSchema = {
  codigo_fipe: z.string().max(20).describe('Código FIPE do veículo (ex: "004001-1" ou "001004-7")'),
};

export async function executeFipeLookup(args: { codigo_fipe: string }) {
  const cleanCode = args.codigo_fipe.trim();
  const cacheKey = `fipe_${cleanCode}`;
  
  const cached = dbService.getCachedResponse(cacheKey);
  if (cached) {
    console.log(`[Cache Hit] Retornando dados FIPE do cache local: ${cleanCode}`);
    return {
      content: [{ type: 'text', text: cached }],
    };
  }

  try {
    const response = await axios.get(`https://brasilapi.com.br/api/fipe/preco/v1/${cleanCode}`, { timeout: 8000 });
    const data = response.data;

    if (!data || data.length === 0) {
      return {
        content: [{ type: 'text', text: `Nenhum veículo encontrado para o código FIPE "${cleanCode}".` }],
      };
    }

    const item = data[0];
    const result = {
      marca: item.marca,
      modelo: item.modelo,
      ano_modelo: item.anoModelo,
      combustivel: item.combustivel,
      valor_fipe: item.valor,
      codigo_fipe: item.codigoFipe,
      mes_referencia: item.mesReferencia,
    };

    const stringResult = JSON.stringify(result, null, 2);
    
    // Cache FIPE por 24 horas
    dbService.setCachedResponse(cacheKey, stringResult, 86400);

    return {
      content: [{ type: 'text', text: stringResult }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Erro ao consultar Tabela FIPE: ${error.response?.data?.message || error.message}` }],
      isError: true,
    };
  }
}
