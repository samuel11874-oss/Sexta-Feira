const express = require('express');
const app = express();

// Configurações para aceitar JSON, formulários e TEXTO PURO (fundamental para o app)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text()); 

async function processarChatUniversal(req, res) {
  try {
    let mensagemUsuario = "";

    // 1. Identifica se o app enviou texto puro (string direta) ou JSON
    if (typeof req.body === 'string' && req.body.trim() !== "") {
      mensagemUsuario = req.body;
    } else if (req.body && typeof req.body === 'object') {
      mensagemUsuario = req.body.mensagem || req.body.message || req.body.text || req.body.query;
    }

    // 2. Se ainda estiver vazio, confere se veio por URL (Query Params)
    if (!mensagemUsuario && req.query) {
      mensagemUsuario = req.query.mensagem || req.query.text || req.query.q;
    }

    // Se continuar vazio, avisa nos logs
    if (!mensagemUsuario || typeof mensagemUsuario !== 'string' || mensagemUsuario.trim() === "") {
      console.log("Aviso: Requisição recebida, mas o corpo da mensagem veio vazio.");
      return res.json({ 
        resposta: "Erro: Nenhuma mensagem foi enviada pelo aplicativo.", 
        reply: "Erro: Nenhuma mensagem foi enviada pelo aplicativo.",
        text: "Erro: Nenhuma mensagem foi enviada pelo aplicativo." 
      });
    }

    mensagemUsuario = mensagemUsuario.trim();
    console.log(`Mensagem processada com sucesso: ${mensagemUsuario}`);
    
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

    console.log(`Sucesso absoluto! Resposta gerada via: ${provedorUsado}`);

    // Retorno compatível com o app
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

// Intercepta qualquer rota ou método enviado pelo app
app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor blindado do Sexta-Feira rodando na porta ${PORT}`);
});
