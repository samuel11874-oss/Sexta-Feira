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

    const textoResposta = "Teste concluído com sucesso. Todos os sistemas estão operacionais. Como posso ajudar você hoje?";
    
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
