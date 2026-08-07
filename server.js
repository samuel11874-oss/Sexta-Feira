const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

let contadorRodizio = 0;

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

    // Alterna o uso entre Groq e Gemini a cada nova mensagem
    contadorRodizio++;
    const usarGroqPrimeiro = contadorRodizio % 2 !== 0;

    if (usarGroqPrimeiro) {
      // 1. TENTA GROQ
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
              messages: [{ role: "user", content: mensagemUsuario }]
            })
          });

          const groqData = await groqResponse.json();
          if (groqResponse.ok && groqData.choices?.[0]?.message?.content) {
            textoResposta = groqData.choices[0].message.content;
            provedorUsado = "Groq (Rodízio Ativo)";
          }
        }
      } catch (e) {
        console.log("Groq falhou no rodízio:", e.message);
      }

      // Se a Groq falhou, tenta o Gemini
      if (!textoResposta) {
        try {
          textoResposta = await chamarGemini(mensagemUsuario);
          provedorUsado = "Gemini (Fallback do Rodízio)";
        } catch (errGemini) {
          console.log("Gemini fallback também falhou:", errGemini.message);
        }
      }

    } else {
      // 2. TENTA GEMINI PRIMEIRO
      try {
        textoResposta = await chamarGemini(mensagemUsuario);
        provedorUsado = "Gemini (Rodízio Ativo)";
      } catch (e) {
        console.log("Gemini falhou no rodízio:", e.message);
      }

      // Se o Gemini falhou, tenta a Groq
      if (!textoResposta) {
        try {
          const groqKey = process.env.GROQ_API_KEY;
          const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [{ role: "user", content: mensagemUsuario }]
            })
          });
          const groqData = await groqResponse.json();
          if (groqResponse.ok && groqData.choices?.[0]?.message?.content) {
            textoResposta = groqData.choices[0].message.content;
            provedorUsado = "Groq (Fallback do Rodízio)";
          }
        } catch (errGroq) {
          console.log("Groq fallback também falhou:", errGroq.message);
        }
      }
    }

    if (!textoResposta) {
      textoResposta = "Erro: Ambas as APIs falharam nesta requisição.";
      provedorUsado = "Nenhum";
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

// Função robusta para chamar o Gemini com logs detalhados de erro
async function chamarGemini(mensagemUsuario) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error("A chave GEMINI_API_KEY não está configurada nas variáveis do Render!");
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

  const geminiResponse = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
  console.log(`Servidor Dual-API Ativo v2 rodando na porta ${PORT}`);
});
