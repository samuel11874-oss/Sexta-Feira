const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

// Inicialização da API do Google com a chave de ambiente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configuração do modelo 3.5-flash com System Prompt (Personalidade do Sexta-Feira)
const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
  systemInstruction: "Você é o Sexta-Feira, um assistente virtual inteligente, focado em dar respostas diretas, eficientes e práticas. Ajude o usuário com clareza e precisão."
});

// Inicialização da sessão de chat para manter o histórico de conversas na memória
const chat = model.startChat({ history: [] });

// Função com tentativas automáticas (Retry) para resiliência de rede
async function chamarComRetry(chatSession, mensagem, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const result = await chatSession.sendMessage(mensagem);
      return await result.response;
    } catch (error) {
      console.warn(`Tentativa ${i + 1} falhou. Tentando novamente...`, error.message);
      if (i === tentativas - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2 segundos antes de tentar de novo
    }
  }
}

// Rota principal do servidor para receber as mensagens do aplicativo
app.post('/chat', async (req, res) => {
  try {
    const mensagemUsuario = req.body.mensagem || req.body.message;
    if (!mensagemUsuario) {
      return res.status(400).json({ erro: "Mensagem não informada." });
    }

    console.log(`Mensagem recebida do usuário: ${mensagemUsuario}`);

    // Executa a chamada mantendo o histórico de chat e o sistema de retry
    const response = await chamarComRetry(chat, mensagemUsuario);
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
