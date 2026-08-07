const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Função centralizada e universal para processar o chat (Groq + Gemini)
async function processarChatUniversal(req, res) {
  try {
    // Captura a mensagem independentemente de como o app envie (corpo JSON ou parâmetros)
    const mensagemUsuario = req.body.mensagem || req.body.message || req.body.text || req.query.mensagem || req.query.text;
    
    if (!mensagemUsuario) {
      return res.json({ 
        resposta: "Servidor online e operando.", 
        reply: "Servidor online e operando.",
        text: "Servidor online e operando." 
      });
    }

    console.log(`Mensagem capturada: ${mensagemUsuario}`);
    let textoResposta = "";
    let provedorUsado = "";

    // 1. TENTATIVA 1: Groq (Alta Velocidade)
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
          provedorUsado = "Groq";
        }
      }
    } catch (groqError) {
      console.log("Aviso: Groq indisponível, alternando para Gemini...", groqError.message);
    }

    // 2. TENTATIVA 2: Gemini (Backup Automático)
    if (!textoResposta) {
      const geminiKey = process.env.GEMINI_API_KEY;
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
        textoResposta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta da IA.";
        provedorUsado = "Gemini";
      } else {
        throw new Error(geminiData.error?.message || "Erro no processamento do Gemini");
      }
    }

    console.log(`Sucesso! Resposta gerada via: ${provedorUsado}`);

    // Retorno compatível com qualquer estrutura de blocos do app
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

// BLINDAGEM TOTAL: Qualquer rota ou método enviado pelo app cairá aqui, eliminando o "not found"
app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor blindado do Sexta-Feira rodando na porta ${PORT}`);
});
