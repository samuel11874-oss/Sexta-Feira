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
    let provedorUsado = "";

    // 1. TENTA GEMINI PRIMEIRO (Utilizando o modelo 3.5)
    try {
      textoResposta = await chamarGemini(mensagemUsuario);
      provedorUsado = "Gemini (Principal)";
    } catch (errGemini) {
      console.log("Gemini falhou, tentando Groq como fallback...", errGemini.message);
    }

    // 2. SE O GEMINI FALHAR, TENTA GROQ
    if (!textoResposta) {
      try {
        const groqKey = process.env.GROQ_API_KEY;
        if (groqKey) {
          const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: SISTEMA_IDENTIDADE },
                { role: "user", content: mensagemUsuario }
              ]
            })
          });
          const groqData = await groqResponse.json();
          if (groqResponse.ok && groqData.choices?.[0]?.message?.content) {
            textoResposta = groqData.choices[0].message.content;
            provedorUsado = "Groq (Fallback)";
          }
        }
      } catch (errGroq) {
        console.log("Groq fallback também falhou:", errGroq.message);
      }
    }

    if (!textoResposta) {
      textoResposta = "Olá Samuel! Sou a Sexta-Feira. Tivemos uma instabilidade momentânea, mas já estou pronta para ajudar.";
      provedorUsado = "Sistema (Emergência)";
    }

    console.log(`Sucesso! Resposta gerada via: ${provedorUsado}`);

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

// Função dedicada ao Gemini utilizando o modelo 3.5
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

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira (Gemini 3.5 Ativo) rodando na porta ${PORT}`);
});
