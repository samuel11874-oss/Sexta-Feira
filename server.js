const express = require('express');
const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  try {
    const mensagemUsuario = req.body.mensagem || req.body.message || req.body.text;
    if (!mensagemUsuario) {
      return res.status(400).json({ 
        resposta: "Mensagem não informada.", 
        reply: "Mensagem não informada.",
        text: "Mensagem não informada." 
      });
    }

    console.log(`Mensagem recebida: ${mensagemUsuario}`);
    let textoResposta = "";
    let provedorUsado = "";

    // 1. TENTATIVA 1: Usar a Groq (Prioridade pela velocidade)
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey) {
        console.log("Tentando processar com a Groq...");
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
      console.log("Aviso: Groq falhou, acionando redundância...", groqError.message);
    }

    // 2. TENTATIVA 2 (FALLBACK): Se a Groq falhou, usa o Gemini automaticamente
    if (!textoResposta) {
      console.log("Acionando o Gemini automaticamente como backup...");
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
        textoResposta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        provedorUsado = "Gemini";
      } else {
        const erroGemini = geminiData.error?.message || "Erro desconhecido no Gemini";
        throw new Error(erroGemini);
      }
    }

    console.log(`Sucesso absoluto! Respondido via: ${provedorUsado}`);

    // Retorna a resposta para o aplicativo
    res.json({ 
      resposta: textoResposta, 
      reply: textoResposta, 
      text: textoResposta 
    });

  } catch (error) {
    console.error("Erro crítico no sistema dual:", error);
    res.json({ 
      resposta: `Erro em ambos os sistemas: ${error.message}`, 
      reply: `Erro em ambos os sistemas: ${error.message}`, 
      text: `Erro em ambos os sistemas: ${error.message}` 
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Dual-IA do Sexta-Feira rodando na porta ${PORT}`);
});
