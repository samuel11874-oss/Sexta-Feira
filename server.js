const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Conexão com o MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Conectado ao MongoDB Atlas com sucesso!"))
  .catch(err => console.error("Erro ao conectar no MongoDB:", err));

// Função para chamar a API da Mistral (3ª opção)
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

// Função para chamar a API do Groq (2ª opção)
async function chamarGroq(mensagem) {
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: mensagem }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
                }
            }
        );
        return { texto: response.data.choices[0].message.content, origem: 'Groq (Fallback)' };
    } catch (error) {
        console.log("Erro no Groq:", error.response ? error.response.data : error.message);
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
            const responseGemini = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    contents: [{ parts: [{ text: mensagem }] }]
                }
            );
            respostaTexto = responseGemini.data.candidates[0].content.parts[0].text;
            origemResposta = "Gemini";
        } catch (erroGemini) {
            console.log("Gemini ocupado ou com falha, acionando Groq...");
            try {
                // 2º Tenta o Groq
                const resultadoGroq = await chamarGroq(mensagem);
                respostaTexto = resultadoGroq.texto;
                origemResposta = resultadoGroq.origem;
            } catch (erroGroq) {
                console.log("Groq indisponível, acionando Mistral...");
                // 3º Tenta a Mistral
                const resultadoMistral = await chamarMistral(mensagem);
                respostaTexto = resultadoMistral.texto;
                origemResposta = resultadoMistral.origem;
            }
        }

        // Retorna a resposta direta para o app (SEM saudação automática)
        res.json({
            resposta: respostaTexto,
            origem: origemResposta
        });

    } catch (err) {
        console.error("Erro geral no servidor:", err);
        res.status(500).json({ erro: "Erro ao processar a requisição." });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
