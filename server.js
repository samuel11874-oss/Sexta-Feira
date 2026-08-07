const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Conexão com o MongoDB e rotas existentes...

// Função para chamar a API da Mistral
async function chamarMistral(mensagem) {
    try {
        const response = await axios.post(
            'https://api.mistral.ai/v1/chat/completions',
            {
                model: 'mistral-small-latest',
                messages: [{ role: 'user', content: mensagem }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
                }
            }
        );
        return { texto: response.data.choices[0].message.content, origem: 'Mistral (Fallback)' };
    } catch (error) {
        console.log("Erro na Mistral:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// Rota principal de processamento de mensagens
app.post('/chat', async (req, res) => {
    try {
        const mensagem = req.body.mensagem || req.body.message;
        
        if (!mensagem) {
            return res.status(400).json({ erro: "Nenhuma mensagem identificada." });
        }

        let respostaTexto = "";
        let origemResposta = "";

        try {
            // 1º Tenta o Gemini
            // (Insira aqui a sua lógica atual do Gemini)
        } catch (erroGemini) {
            console.log("Gemini ocupado, acionando Groq...");
            try {
                // 2º Tenta o Groq
                // (Insira aqui a sua lógica atual do Groq)
            } catch (erroGroq) {
                console.log("Groq indisponível, acionando Mistral...");
                // 3º Tenta a Mistral
                const resultadoMistral = await chamarMistral(mensagem);
                respostaTexto = resultadoMistral.texto;
                origemResposta = resultadoMistral.origem;
            }
        }

        // Retorna a resposta direta para o app (SEM textos de apresentação automática)
        res.json({
            resposta: respostaTexto,
            origem: origemResposta
        });

    } catch (err) {
        res.status(500).json({ erro: "Erro ao processar a requisição." });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
