const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// Configurações para ler JSON e dados enviados pelo app Kodular
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializa a IA usando a chave de API armazenada nas variáveis de ambiente do Render
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/chat', async (req, res) => {
    try {
        // Captura a mensagem enviada pelo aplicativo Kodular
        const userMessage = req.body.text || req.body.query || Object.keys(req.body)[0];
        
        if (!userMessage) {
            return res.status(400).json({ resposta: "Por favor, envie uma mensagem válida." });
        }

        console.log(`Mensagem recebida do usuário: ${userMessage}`);

        // Chama o modelo Gemini ativando a ferramenta de busca do Google (Grounding)
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userMessage,
            config: {
                // Ativa o Google Search para pesquisas na web em tempo real
                tools: [{ googleSearch: {} }],
                // Define a personalidade do assistente estilo Jarvis
                systemInstruction: "Você é o Sexta-Feira, um assistente de inteligência artificial altamente avançado, inteligente, prestativo e direto ao ponto, nos moldes do Jarvis e do Gemini."
            }
        });

        const aiResponseText = response.text || "Não consegui processar uma resposta no momento.";

        console.log(`Resposta gerada pela IA: ${aiResponseText}`);

        // Retorna a resposta em JSON no formato exato que o Kodular espera ("resposta")
        res.json({
            resposta: aiResponseText
        });

    } catch (error) {
        console.error("Erro ao processar a requisição na IA:", error);
        res.status(500).json({ 
            resposta: "Erro interno no servidor ao se comunicar com a inteligência artificial." 
        });
    }
});

// Porta padrão do Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor do Sexta-Feira rodando na porta ${PORT}`);
});
