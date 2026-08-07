const express = require('express');
const app = express();
app.use(express.json());

// Função centralizada para processar as mensagens (Groq + Gemini)
async function processarChat(req, res) {
  try {
    const mensagemUsuario = req.body.mensagem || req.body.message || req.body.text;
    
    if (!mensagemUsuario) {
      return res.status(400).json({ 
        resposta: "Mensagem não informada.", 
        reply: "Mensagem não informada.",
        text: "Mensagem não informada." 
      });
    }

    console.log(`Mensagem recebida do app: ${mensagemUsuario}`);
    let textoResposta = "";
    let provedorUsado = "";

    // 1. TENTATIVA 1: Groq (Mais rápido)
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
        } else {
            console.log("Erro interno da Groq, falhou ao retornar texto.");
        }
      }
    } catch (groqError) {
      console.log("Aviso: Groq falhou, acionando backup...", groqError.message);
    }

    // 2. TENTATIVA 2 (BACKUP): Gemini (Se a Groq falhar ou não tiver chave)
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
        textoResposta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta da IA.";
        provedorUsado = "Gemini";
      } else {
        const erroGemini = geminiData.error?.message || "Erro desconhecido no Gemini";
        throw new Error(erroGemini);
      }
    }

    console.log(`Sucesso! Respondido por: ${provedorUsado}`);

    // Devolve a resposta para o app no celular
    res.json({ 
      resposta: textoResposta, 
      reply: textoResposta, 
      text: textoResposta 
    });

  } catch (error) {
    console.error("Erro crítico:", error);
    res.json({ 
      resposta: `Erro no servidor: ${error.message}`, 
      reply: `Erro no servidor: ${error.message}`, 
      text: `Erro no servidor: ${error.message}` 
    });
  }
}

// ==========================================
// A SOLUÇÃO DO SEU ERRO "NOT FOUND" ESTÁ AQUI:
// O servidor agora aceita tanto "/" quanto "/chat"
// ==========================================
app.post('/', processarChat);
app.post('/chat', processarChat);

// Rota para você testar no navegador do computador/celular
app.get('/', (req, res) => {
  res.send('Servidor do Sexta-Feira está ONLINE e funcionando com Duas APIs!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});
