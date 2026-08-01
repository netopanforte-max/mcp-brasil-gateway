import crypto from 'crypto';

// Algoritmo CRC16 CCITT para validação e conformidade do Pix (BR Code)
function calculateCRC16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ (x << 0)) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatEMV(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

export const pixService = {
  // Gera o código Pix Copia e Cola Estático em formato padrão BR Code
  generateStaticPix(amount: number, clientName: string, pixKey: string = '4709111809'): { payload: string; txid: string } {
    const txid = 'MCP' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const formattedAmount = amount.toFixed(2);
    
    // Merchant Account Information (Pix)
    const gui = formatEMV('00', 'br.gov.bcb.pix');
    const key = formatEMV('01', pixKey);
    const desc = formatEMV('02', `Creditos MCP - ${clientName.slice(0, 10)}`);
    const merchantAccountInfo = formatEMV('26', `${gui}${key}${desc}`);
    
    // Additional Data Field Template (TXID)
    const additionalData = formatEMV('62', formatEMV('05', txid));

    let payload = '';
    payload += formatEMV('00', '01'); // Payload Format Indicator
    payload += merchantAccountInfo;
    payload += formatEMV('52', '0000'); // Merchant Category Code
    payload += formatEMV('53', '986'); // Transaction Currency (BRL)
    payload += formatEMV('54', formattedAmount); // Transaction Amount
    payload += formatEMV('58', 'BR'); // Country Code
    payload += formatEMV('59', 'MCP Brasil Gateway'); // Merchant Name
    payload += formatEMV('60', 'BRASILIA'); // Merchant City
    payload += additionalData;
    payload += '6304'; // CRC16 indicator

    const crc = calculateCRC16(payload);
    payload += crc;

    return { payload, txid };
  }
};
