const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializa a IA
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.text || req.body.query || Object.keys(req.body)[0];
        
        if (!userMessage) {
            return res.status(400).json({ resposta: "Por favor, envie uma mensagem válida." });
        }

        console.log(`Mensagem recebida do usuário: ${userMessage}`);

        // Usando o modelo correto suportado pelo SDK atual do Google Gen AI
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash-latest',
            contents: userMessage,
            config: {
                tools: [{ googleSearch: {} }],
                systemInstruction: "Você é o Sexta-Feira, um assistente de inteligência artificial altamente avançado, inteligente, prestativo e direto ao ponto, nos moldes do Jarvis e do Gemini."
            }
        });

        const aiResponseText = response.text || "Não consegui processar uma resposta no momento.";
        console.log(`Resposta gerada pela IA: ${aiResponseText}`);

        res.json({ resposta: aiResponseText });

    } catch (error) {
        console.error("--- ERRO DETALHADO NA IA ---");
        console.error("Mensagem do erro:", error.message);
        console.error("JSON do erro:", JSON.stringify(error, null, 2));
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
