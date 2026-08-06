const express = require('express');

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  try {
    const mensagemUsuario = req.body.mensagem || req.body.message;
    if (!mensagemUsuario) {
      return res.status(400).json({ erro: "Mensagem não informada." });
    }

    console.log(`Mensagem recebida do usuário: ${mensagemUsuario}`);

    const token = process.env.GEMINI_API_KEY;
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: mensagemUsuario }]
        }]
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("Erro retornado pela API:", data);
      return res.status(500).json({ erro: data.error?.message || "Erro na comunicação com a IA." });
    }

    const textoResposta = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta da IA.";
    console.log(`Resposta gerada pela IA: ${textoResposta}`);
    res.json({ resposta: textoResposta });

  } catch (error) {
    console.error("--- ERRO NO SERVIDOR ---", error);
    res.status(500).json({ erro: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor do Sexta-Feira rodando na porta ${PORT}`);
});
