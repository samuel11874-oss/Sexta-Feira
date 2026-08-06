const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializa com o SDK clássico e seguro do Google
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.text || req.body.query || Object.keys(req.body)[0];
        
        if (!userMessage) {
            return res.status(400).json({ resposta: "Por favor, envie uma mensagem válida." });
        }

        console.log(`Mensagem recebida do usuário: ${userMessage}`);

        // Utiliza o modelo gemini-1.5-flash com suporte a system instruction
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-3.5-flash',
            systemInstruction: "Você é o Sexta-Feira, um assistente de inteligência artificial altamente avançado, inteligente, prestativo e direto ao ponto, nos moldes do Jarvis e do Gemini."
        });

        const result = await model.generateContent(userMessage);
        const response = await result.response;
        const aiResponseText = response.text();

        console.log(`Resposta gerada pela IA: ${aiResponseText}`);

        res.json({ resposta: aiResponseText });

    } catch (error) {
        console.error("--- ERRO DETALHADO NA IA ---");
        console.error("Mensagem do erro:", error.message);
        console.error("Stack trace:", error.stack);
        console.error("-----------------------------");

        res.status(500).json({ 
            resposta: `Erro no servidor: ${error.message || "Erro desconhecido ao chamar a IA"}` 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor do Sexta-Feira rodando na porta ${PORT}`);
});
