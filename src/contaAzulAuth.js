const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CLIENTS_PATH = path.join(__dirname, '..', 'config', 'clients.json');
const AUTH_BASE = 'https://auth.contaazul.com';

function readClients() {
  const raw = fs.readFileSync(CLIENTS_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeClients(data) {
  fs.writeFileSync(CLIENTS_PATH, JSON.stringify(data, null, 2));
}

function getClient(clienteId) {
  const data = readClients();
  const cliente = data.clientes.find(c => c.id === clienteId);
  if (!cliente) throw new Error(`Cliente "${clienteId}" não encontrado em config/clients.json`);
  return cliente;
}

function basicAuthHeader(client_id, client_secret) {
  const raw = `${client_id}:${client_secret}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

/**
 * Monta a URL para redirecionar o cliente até a tela de login do Conta Azul.
 * Use isso quando for conectar um cliente NOVO (que ainda não tem refresh_token).
 */
function buildAuthorizeUrl({ client_id, redirect_uri, state }) {
  const scope = 'openid+profile+aws.cognito.signin.user.admin';
  return `${AUTH_BASE}/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${encodeURIComponent(state)}&scope=${scope}`;
}

/**
 * Troca o "code" recebido no callback por access_token + refresh_token
 * e já salva no clients.json para o cliente informado.
 */
async function exchangeCodeForTokens({ clienteId, client_id, client_secret, code, redirect_uri }) {
  const resp = await axios.post(
    `${AUTH_BASE}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri
    }).toString(),
    {
      headers: {
        Authorization: basicAuthHeader(client_id, client_secret),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  const { access_token, refresh_token, expires_in } = resp.data;
  saveTokens(clienteId, { client_id, client_secret, access_token, refresh_token, expires_in });
  return resp.data;
}

function saveTokens(clienteId, { client_id, client_secret, access_token, refresh_token, expires_in }) {
  const data = readClients();
  let cliente = data.clientes.find(c => c.id === clienteId);
  if (!cliente) {
    cliente = { id: clienteId, nome: clienteId, contaazul: {} };
    data.clientes.push(cliente);
  }
  cliente.contaazul.client_id = client_id;
  cliente.contaazul.client_secret = client_secret;
  cliente.contaazul.access_token = access_token;
  cliente.contaazul.refresh_token = refresh_token || cliente.contaazul.refresh_token;
  cliente.contaazul.access_token_expires_at = Date.now() + (expires_in - 60) * 1000; // 60s de folga
  writeClients(data);
}

/**
 * Devolve um access_token válido para o cliente, renovando com o
 * refresh_token automaticamente se estiver expirado.
 */
async function getValidAccessToken(clienteId) {
  const cliente = getClient(clienteId);
  const ca = cliente.contaazul;

  const expirado = !ca.access_token_expires_at || Date.now() >= ca.access_token_expires_at;

  if (!expirado) return ca.access_token;

  if (!ca.refresh_token || ca.refresh_token.startsWith('COLE_AQUI')) {
    throw new Error(
      `Cliente "${clienteId}" ainda não tem refresh_token configurado. ` +
      `Rode o fluxo de conexão em GET /auth/contaazul/connect/${clienteId}`
    );
  }

  const resp = await axios.post(
    `${AUTH_BASE}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: ca.refresh_token
    }).toString(),
    {
      headers: {
        Authorization: basicAuthHeader(ca.client_id, ca.client_secret),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  const { access_token, refresh_token, expires_in } = resp.data;
  saveTokens(clienteId, {
    client_id: ca.client_id,
    client_secret: ca.client_secret,
    access_token,
    refresh_token: refresh_token || ca.refresh_token,
    expires_in
  });

  return access_token;
}

module.exports = {
  readClients,
  getClient,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getValidAccessToken
};
