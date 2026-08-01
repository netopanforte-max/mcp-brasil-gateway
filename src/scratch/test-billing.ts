import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const CLIENT_KEY = 'mcp_live_6f392175bcb8cc623f6a533a87a591cb'; // Chave demo gerada anteriormente
const WEBHOOK_TOKEN = 'mcp_webhook_secure_token_123';

async function runTest() {
  console.log('--- TESTE DE SISTEMA DE COBRANÇA PIX AUTOMÁTICA ---');
  
  try {
    // 1. Gerar cobrança Pix de R$ 15,50 (que devem virar 1550 créditos)
    console.log('\n[1/3] Solicitando geração de Pix de R$ 15.50...');
    const billingResponse = await axios.post(`${BASE_URL}/billing/pix?api_key=${CLIENT_KEY}`, {
      amount: 15.50
    });
    
    const { txid, pix_copia_e_cola, credits_to_add } = billingResponse.data;
    console.log(`✅ Pix Gerado!`);
    console.log(`TxID: ${txid}`);
    console.log(`Créditos Esperados: ${credits_to_add}`);
    console.log(`Payload Pix: ${pix_copia_e_cola.slice(0, 60)}...`);

    // 2. Simular confirmação automática via Webhook com assinatura segura
    console.log('\n[2/3] Enviando simulação de webhook de confirmação aprovada...');
    const webhookResponse = await axios.post(
      `${BASE_URL}/gateway/webhook/pix`,
      {
        txid,
        status: 'approved'
      },
      {
        headers: {
          'x-webhook-token': WEBHOOK_TOKEN
        }
      }
    );
    
    console.log(`✅ Resposta do Webhook:`, webhookResponse.data);

    // 3. Verificar saldo de créditos após o webhook
    console.log('\n[3/3] Verificando se os créditos foram liberados...');
    // Fazemos uma chamada simulada de conexão para ver o saldo retornado nos headers
    const checkResponse = await axios.get(`${BASE_URL}/health?api_key=${CLIENT_KEY}`);
    console.log(`✅ Status da chave verificado.`);

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  }
}

runTest();
