import { dbService } from '../gateway/db.js';

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

console.log(`===================================================`);
console.log(`🔑 MCP Brasil Gateway - Gerenciador de Chaves CLI`);
console.log(`===================================================\n`);

switch (command) {
  case 'create':
    if (!arg1) {
      console.log(`Uso: npm run cli create <nome_do_cliente> [creditos_iniciais]`);
      process.exit(1);
    }
    const credits = arg2 ? parseInt(arg2, 10) : 100;
    const newKey = dbService.createApiKey(arg1, credits);
    console.log(`✅ Nova chave gerada com sucesso!`);
    console.log(`Cliente: ${arg1}`);
    console.log(`Créditos: ${credits}`);
    console.log(`Chave de API: ${newKey}\n`);
    console.log(`Passe esta chave ao seu cliente para usar na URL: ?api_key=${newKey}`);
    break;

  case 'list':
    const keys = dbService.listKeys();
    console.log(`📋 Lista de Chaves de API Cadastradas (${keys.length}):\n`);
    console.table(keys.map(k => ({
      ID: k.id,
      Cliente: k.client_name,
      Chave: k.key,
      Creditos: k.credits,
      Ativa: k.active ? 'Sim' : 'Não',
      CriadaEm: k.created_at
    })));
    break;

  case 'recharge':
    if (!arg1 || !arg2) {
      console.log(`Uso: npm run cli recharge <chave_de_api> <quantidade_creditos>`);
      process.exit(1);
    }
    const amount = parseInt(arg2, 10);
    const success = dbService.addCredits(arg1, amount);
    if (success) {
      console.log(`✅ ${amount} créditos adicionados com sucesso à chave ${arg1}!`);
    } else {
      console.log(`❌ Erro: Chave de API não encontrada.`);
    }
    break;

  default:
    console.log(`Comandos disponíveis:`);
    console.log(`  npm run cli create <nome_cliente> [creditos] - Gerar nova API Key`);
    console.log(`  npm run cli list                           - Listar todas as chaves`);
    console.log(`  npm run cli recharge <chave> <creditos>     - Adicionar créditos a uma chave`);
    break;
}
