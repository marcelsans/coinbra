const express = require('express');
const router = express.Router();
const { buildAuthorizeUrl, exchangeCodeForTokens, getClient } = require('../contaAzulAuth');

const REDIRECT_URI = process.env.CONTA_AZUL_REDIRECT_URI || 'https://virtus-dashboard.onrender.com/auth/contaazul/callback';

/**
 * Passo 1: abra essa rota no navegador (troque :clienteId pelo id do cliente
 * cadastrado em config/clients.json) pra iniciar a conexão com o Conta Azul.
 * Ex: http://localhost:3000/auth/contaazul/connect/asset-gestao
 */
router.get('/contaazul/connect/:clienteId', (req, res) => {
  const { clienteId } = req.params;
  let cliente;
  try {
    cliente = getClient(clienteId);
  } catch (e) {
    return res.status(404).send(e.message);
  }

  const url = buildAuthorizeUrl({
    client_id: cliente.contaazul.client_id,
    redirect_uri: REDIRECT_URI,
    state: clienteId // usamos o próprio id do cliente como "state" pra saber quem voltou
  });

  res.redirect(url);
});

/**
 * Passo 2: o Conta Azul redireciona pra cá sozinho depois do login do cliente.
 * Aqui a gente troca o "code" por access_token/refresh_token e já salva.
 */
router.get('/contaazul/callback', async (req, res) => {
  const { code, state } = req.query;
  const clienteId = state;

  if (!code || !clienteId) {
    return res.status(400).send('Faltou "code" ou "state" no callback do Conta Azul.');
  }

  try {
    const cliente = getClient(clienteId);
    await exchangeCodeForTokens({
      clienteId,
      client_id: cliente.contaazul.client_id,
      client_secret: cliente.contaazul.client_secret,
      code,
      redirect_uri: REDIRECT_URI
    });
    res.send(`✅ Cliente "${clienteId}" conectado ao Conta Azul com sucesso! Pode fechar esta aba.`);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).send('Erro ao trocar o código por token. Veja o log do servidor.');
  }
});

module.exports = router;
