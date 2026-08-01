# 🇧🇷 MCP Brasil Gateway

[![Smithery Badge](https://img.shields.io/badge/Smithery-Indexed-blue)](https://smithery.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2020.0.0-green.svg)](https://nodejs.org/)

A professional, high-performance **Model Context Protocol (MCP) Server** that connects AI Agents (like Claude Code, Cursor, Windsurf, Copilot) to live public and commercial databases in Brazil. 

Optimized for token context windows with built-in 24-hour caching and secure client-side API Key metering.

---

## 🚀 Live Demo & API Keys
Get a free 20-credits trial key and manage your account instantly at:
👉 **[https://widespread-debate-injured-hope.trycloudflare.com](https://widespread-debate-injured-hope.trycloudflare.com)**

---

## 🛠️ Available Tools

Our server registers the following tools directly into your AI Agent:

1.  **`consulta_cnpj_enriquecida`**: 
    - *Description:* Detailed cadastral data of any Brazilian company by CNPJ.
    - *Returns:* Corporate name, trade name, active status, start date, capital, address, partners (QSA), and main CNAE.
2.  **`consulta_pncp_licitacoes`**:
    - *Description:* Searches active government contracts, tenders, and bids from the National Public Procurement Portal (PNCP) by keywords and state.
3.  **`consulta_fipe_veiculos_imoveis`**:
    - *Description:* Returns official cotação prices from the Tabela FIPE database for vehicles.
4.  **`cadastrar_alerta_licitacao`**:
    - *Description:* Registers a keyword search to run 24/7 in the background and notify the client when new tenders are posted.

---

## ⚙️ Configuration

### 1. Claude Desktop
Add this snippet to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-brasil-gateway": {
      "url": "https://widespread-debate-injured-hope.trycloudflare.com/sse?api_key=YOUR_API_KEY_HERE"
    }
  }
}
```

### 2. Cursor / Windsurf
Add a new SSE server in your developer settings:
*   **Name:** `mcp-brasil`
*   **Type:** `SSE`
*   **URL:** `https://widespread-debate-injured-hope.trycloudflare.com/sse?api_key=YOUR_API_KEY_HERE`

---

## 🔒 Security & Performance
- **Zero Block I/O:** Built with an asynchronous, in-memory caching database to eliminate disk read latency.
- **OWASP Hardened:** Includes payload limits to prevent Denial of Service (DoS) attacks and strictly sanitizes inputs to prevent string injections.
- **Fail-Secure Architecture:** Unhandled exceptions are globally caught to ensure the server stays online even when third-party APIs fail.

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
