const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

// Inicialização da API do Google com a chave de ambiente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Usando o modelo oficial e estável gemini-1.5-flash
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Rota principal do servidor para receber as mensagens do aplicativo
app.post('/chat', async (req, res) => {
  try {
    const mensagemUsuario = req.body.mensagem || req.body.message;
    if (!mensagemUsuario) {
      return res.status(400).json({ erro: "Mensagem não informada." });
    }

    console.log(`Mensagem recebida do usuário: ${mensagemUsuario}`);

    const result = await model.generateContent(mensagemUsuario);
    const response = await result.response;
    const textoResposta = response.text();

    console.log(`Resposta gerada pela IA: ${textoResposta}`);
    res.json({ resposta: textoResposta });

  } catch (error) {
    console.error("--- ERRO DETALHADO NA IA ---", error);
    res.status(500).json({ erro: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor do Sexta-Feira rodando na porta ${PORT}`);
});
