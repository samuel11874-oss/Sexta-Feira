const express = require('express');
const app = express();

// Configurações para interceptar absolutamente qualquer formato de envio do app
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' })); // Captura texto cru independentemente do cabeçalho

async function processarChatUniversal(req, res) {
  try {
    console.log("--- NOVA REQUISIÇÃO RECEBIDA DO APP ---");
    console.log("Método:", req.method);
    console.log("Query Params:", JSON.stringify(req.query));
    console.log("Corpo Bruto (Body):", req.body);

    let mensagemUsuario = "";

    // 1. Se o corpo chegou como string de texto cru
    if (typeof req.body === 'string' && req.body.trim() !== '') {
      mensagemUsuario = req.body;
    } 
    // 2. Se o corpo chegou como um objeto (JSON ou URL-encoded)
    else if (req.body && typeof req.body === 'object') {
      mensagemUsuario = req.body.mensagem || req.body.message || req.body.text || req.body.query || req.body.value || Object.values(req.body)[0];
    }

    // 3. Fallback para parâmetros de URL, caso o app envie via GET/Query
    if (!mensagemUsuario && req.query) {
      mensagemUsuario = req.query.mensagem || req.query.text || req.query.q || req.query.message;
    }

    // Se por acaso vier como objeto interno, converte para string
    if (typeof mensagemUsuario === 'object' && mensagemUsuario !== null) {
      mensagemUsuario = JSON.stringify(mensagemUsuario);
    }

    // Se continuarem vazios, avisa nos logs o que aconteceu
    if (!mensagemUsuario || typeof mensagemUsuario !== 'string' || mensagemUsuario.trim() === "") {
      console.log("ALERTA: O app enviou uma requisição, mas o texto veio vazio.");
      return res.json({ 
        resposta: "Erro: Nenhuma mensagem foi encontrada no envio do aplicativo.", 
        reply: "Erro: Nenhuma mensagem foi encontrada no envio do aplicativo.",
        text: "Erro: Nenhuma mensagem foi encontrada no envio do aplicativo." 
      });
    }

    mensagemUsuario = mensagemUsuario.trim();
    console.log(`Mensagem extraída com sucesso: "${mensagemUsuario}"`);

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
  console.log(`Servidor ultrablindado do Sexta-Feira rodando na porta ${PORT}`);
});
