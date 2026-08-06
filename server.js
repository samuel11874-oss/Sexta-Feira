const express = require('express');
const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  console.log("=== [INVESTIGAÇÃO] Nova requisição recebida ===");
  
  try {
    const mensagemUsuario = req.body.mensagem || req.body.message;
    console.log(`[INVESTIGAÇÃO] Mensagem recebida: "${mensagemUsuario}"`);

    if (!mensagemUsuario) {
      console.log("[INVESTIGAÇÃO] Erro: Mensagem vazia.");
      return res.status(400).json({ resposta: "Erro: Mensagem não informada." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("[INVESTIGAÇÃO] ERRO CRÍTICO: GEMINI_API_KEY não configurada no Render!");
      return res.status(200).json({ resposta: "Erro: Chave GEMINI_API_KEY ausente no Render." });
    }

    // Diagnóstico seguro da chave (exibe apenas os primeiros caracteres e o tamanho total)
    const prefixoChave = apiKey.substring(0, 4);
    console.log(`[INVESTIGAÇÃO] Chave detectada -> Prefixo: ${prefixoChave}... | Tamanho: ${apiKey.length} caracteres`);

    // URL oficial com autenticação por parâmetro de chave (funciona com qualquer chave válida do Google Cloud/AI Studio)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    console.log("[INVESTIGAÇÃO] Enviando requisição para a API do Google...");

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: mensagemUsuario }]
        }]
      })
    });

    console.log(`[INVESTIGAÇÃO] Status HTTP retornado pelo Google: ${apiResponse.status} ${apiResponse.statusText}`);

    const responseText = await apiResponse.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.log("[INVESTIGAÇÃO] A resposta do Google não veio em JSON:", responseText);
      return res.status(200).json({ resposta: `Erro API (Formato Inválido): ${responseText.substring(0, 80)}` });
    }

    // Se o Google recusar, enviamos a mensagem de erro direto para a tela do app
    if (!apiResponse.ok) {
      console.error("[INVESTIGAÇÃO] Detalhes do erro do Google:", JSON.stringify(data, null, 2));
      const mensagemErroGoogle = data.error?.message || "Erro desconhecido na API";
      return res.status(200).json({ resposta: `Google [${apiResponse.status}]: ${mensagemErroGoogle}` });
    }

    // Extrai o texto gerado pela IA
    const textoResposta = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoResposta) {
      console.error("[INVESTIGAÇÃO] Estrutura de resposta inesperada:", JSON.stringify(data, null, 2));
      return res.status(200).json({ resposta: "Erro: Resposta vazia recebida da IA." });
    }

    console.log(`[INVESTIGAÇÃO] Sucesso absoluto! Resposta gerada: "${textoResposta}"`);
    res.json({ resposta: textoResposta });

  } catch (error) {
    console.error("--- [INVESTIGAÇÃO] EXCEÇÃO NO SERVIDOR ---", error);
    res.status(200).json({ resposta: `Erro Interno do Servidor: ${error.message}` });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor de Investigação do Sexta-Feira rodando na porta ${PORT}`);
});
