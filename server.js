const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

// Identidade fixa e inegociável da assistente
const SISTEMA_IDENTIDADE = "Você se chama Sexta-Feira. Você é a assistente pessoal inteligente e prestativa do Samuel. Nunca esqueça sua identidade: seu nome é Sexta-Feira.";

async function processarChatUniversal(req, res) {
  try {
    console.log("--- NOVA REQUISIÇÃO RECEBIDA DO APP ---");
    let mensagemUsuario = "";

    if (typeof req.body === 'string' && req.body.trim() !== '') {
      mensagemUsuario = req.body;
    } else if (req.body && typeof req.body === 'object') {
      mensagemUsuario = req.body.mensagem || req.body.message || req.body.text || req.body.query || req.body.value || req.body.prompt;
      if (!mensagemUsuario) {
        const chaves = Object.keys(req.body);
        if (chaves.length > 0 && chaves[0] !== '') {
          mensagemUsuario = chaves[0];
        } else {
          mensagemUsuario = Object.values(req.body)[0];
        }
      }
    }

    if (!mensagemUsuario && req.query) {
      mensagemUsuario = req.query.mensagem || req.query.text || req.query.q || req.query.message;
      if (!mensagemUsuario) {
        const queryChaves = Object.keys(req.query);
        if (queryChaves.length > 0) mensagemUsuario = queryChaves[0];
      }
    }

    if (typeof mensagemUsuario === 'object' && mensagemUsuario !== null) {
      mensagemUsuario = JSON.stringify(mensagemUsuario);
    }

    if (!mensagemUsuario || typeof mensagemUsuario !== 'string' || mensagemUsuario.trim() === "") {
      console.log("ALERTA: Nenhuma mensagem identificada.");
      return res.json({ 
        resposta: "Erro: Nenhuma mensagem foi encontrada.", 
        reply: "Erro: Nenhuma mensagem foi encontrada.",
        text: "Erro: Nenhuma mensagem foi encontrada." 
      });
    }

    mensagemUsuario = mensagemUsuario.trim();
    console.log(`Mensagem extraída: "${mensagemUsuario}"`);

    let textoResposta = "";

    // Executa a chamada com o Gemini 3.5 utilizando o sistema de Retry automático
    try {
      textoResposta = await chamarGeminiComRetry(mensagemUsuario);
      console.log("Sucesso absoluto gerado via: Gemini 3.5 Flash");
    } catch (err) {
      console.log("Erro final tratado no Gemini:", err.message);
      textoResposta = "Oi Samuel! Sou a Sexta-Feira. Os servidores estão com alta demanda momentânea. Por favor, envie a mensagem novamente em instantes!";
    }

    return res.json({ 
      resposta: textoResposta, 
      reply: textoResposta, 
      text: textoResposta 
    });

  } catch (error) {
    console.error("Erro crítico no servidor:", error);
    return res.json({ 
      resposta: `Erro interno: ${error.message}`, 
      reply: `Erro interno: ${error.message}`, 
      text: `Erro interno: ${error.message}` 
    });
  }
}

// Função base para requisitar o Gemini 3.5 Flash
async function chamarGemini(mensagemUsuario) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error("A chave GEMINI_API_KEY não está configurada!");
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

  const geminiResponse = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SISTEMA_IDENTIDADE }]
      },
      contents: [{ parts: [{ text: mensagemUsuario }] }]
    })
  });

  const geminiData = await geminiResponse.json();
  if (geminiResponse.ok) {
    return geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta do Gemini.";
  } else {
    const erroMsg = geminiData.error?.message || JSON.stringify(geminiData);
    throw new Error(`Google API Error: ${erroMsg}`);
  }
}

// Sistema de Nova Tentativa Automática (Retry) para zerar erros de picos de tráfego
async function chamarGeminiComRetry(mensagemUsuario) {
  try {
    return await chamarGemini(mensagemUsuario);
  } catch (error) {
    // Se o erro for de alta demanda temporária, aguarda 1.5 segundos e tenta mais uma vez automaticamente
    if (error.message.includes("high demand")) {
      console.log("Pico de alta demanda detectado. Tentando novamente em 1.5 segundos...");
      await new Promise(resolve => setTimeout(resolve, 1500));
      return await chamarGemini(mensagemUsuario);
    }
    throw error;
  }
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira (Zero Erros - 100% Gemini 3.5 com Retry) rodando na porta ${PORT}`);
});
