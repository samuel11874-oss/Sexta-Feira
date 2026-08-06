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

    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: mensagemUsuario }] }]
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      const erroMsg = data.error?.message || "Erro na API do Google";
      console.error("Erro do Google:", erroMsg);
      // Retorna em todas as chaves possíveis para o app ler e exibir na tela
      return res.json({ 
        resposta: `Erro Google: ${erroMsg}`, 
        reply: `Erro Google: ${erroMsg}`, 
        text: `Erro Google: ${erroMsg}` 
      });
    }

    const textoResposta = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta da IA.";
    console.log(`Resposta gerada: ${textoResposta}`);

    // Retorna a resposta em múltiplos formatos para garantir compatibilidade total com o app
    res.json({ 
      resposta: textoResposta, 
      reply: textoResposta, 
      text: textoResposta 
    });

  } catch (error) {
    console.error("Erro interno:", error);
    res.json({ 
      resposta: `Erro interno: ${error.message}`, 
      reply: `Erro interno: ${error.message}`, 
      text: `Erro interno: ${error.message}` 
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
