const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

// CORREÇÃO ESSENCIAL: Libera o CORS para o aplicativo do Spck Editor e navegadores
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

// Identidade fixa da assistente
const SISTEMA_IDENTIDADE = "Você se chama Sexta-Feira. Você é a assistente pessoal inteligente e prestativa do Samuel. Nunca esqueça sua identidade: seu nome é Sexta-Feira.";

// Configuração do MongoDB para Memória
const mongoUri = process.env.MONGO_URI;
let dbColecao = null;

async function conectarBanco() {
  if (!mongoUri) {
    console.log("AVISO: MONGO_URI não configurada. O armazenamento de longo prazo está desativado.");
    return;
  }
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    dbColecao = client.db("sexta_feira_db").collection("memorias");
    console.log("Conectado ao MongoDB Atlas com sucesso!");
  } catch (erro) {
    console.error("Erro ao conectar no MongoDB:", erro.message);
  }
}
conectarBanco();

// Funções de Comunicação com as IAs e Voz
async function chamarGemini(mensagemUsuario) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("A chave GEMINI_API_KEY não está configurada!");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SISTEMA_IDENTIDADE }] },
      contents: [{ parts: [{ text: mensagemUsuario }] }]
    })
  });

  const data = await response.json();
  if (response.ok) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(data.error?.message || "Erro no Gemini");
  }
}

async function chamarGeminiComRetry(mensagemUsuario) {
  try {
    return await chamarGemini(mensagemUsuario);
  } catch (error) {
    if (error.message.includes("high demand") || error.message.includes("429")) {
      console.log("Pico de demanda no Gemini. Tentando novamente em 1 segundo...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await chamarGemini(mensagemUsuario);
    }
    throw error;
  }
}

// Função de áudio ajustada para tom limpo, natural e sem distorção (Neural)
async function gerarAudioGoogleTTS(texto) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return "";

  const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${geminiKey}`;

  const response = await fetch(ttsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text: texto },
      voice: {
        languageCode: "pt-BR",
        name: "pt-BR-Neural2-A", // Voz Neural Feminina de alta qualidade
        ssmlGender: "FEMALE"
      },
      audioConfig: { 
        audioEncoding: "MP3",
        speakingRate: 1.0, // Ritmo perfeitamente natural
        pitch: 0.0         // Tom limpo e corrigido
      }
    })
  });

  const data = await response.json();
  if (response.ok && data.audioContent) {
    return data.audioContent;
  }
  return "";
}

// Função Principal de Processamento do App
async function processarChatUniversal(req, res) {
  try {
    console.log("--- NOVA REQUISIÇÃO RECEBIDA DO APP ---");
    let mensagemUsuario = "";

    if (typeof req.body === 'string' && req.body.trim() !== '') {
      mensagemUsuario = req.body;
    } else if (req.body && typeof req.body === 'object') {
      mensagemUsuario = req.body.mensagem || req.body.message || req.body.text || req.body.query || "";
      if (!mensagemUsuario) {
        const chaves = Object.keys(req.body);
        if (chaves.length > 0 && chaves[0] !== '') {
          mensagemUsuario = chaves[0];
        } else {
          mensagemUsuario = Object.values(req.body)[0] || "";
        }
      }
    }

    if (!mensagemUsuario && req.query) {
      mensagemUsuario = req.query.mensagem || req.query.text || req.query.q || req.query.message || "";
    }

    if (typeof mensagemUsuario === 'object' && mensagemUsuario !== null) {
      mensagemUsuario = JSON.stringify(mensagemUsuario);
    }

    if (!mensagemUsuario || typeof mensagemUsuario !== 'string' || mensagemUsuario.trim() === "") {
      console.log("ALERTA: Nenhuma mensagem identificada.");
      mensagemUsuario = "Oi, Sexta-Feira, está me ouvindo?"; 
    }

    mensagemUsuario = mensagemUsuario.trim();
    console.log(`Mensagem extraída: "${mensagemUsuario}"`);

    let textoResposta = "";
    let provedorUsado = "";

    // 1. TENTA GEMINI PRIMEIRO
    try {
      textoResposta = await chamarGeminiComRetry(mensagemUsuario);
      provedorUsado = "Gemini 3.5 Flash";
    } catch (errGemini) {
      console.log("Gemini ocupado, acionando Groq...", errGemini.message);
    }

    // 2. GROQ FALLBACK (Se o Gemini falhar)
    if (!textoResposta) {
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
              messages: [
                { role: "system", content: SISTEMA_IDENTIDADE },
                { role: "user", content: mensagemUsuario }
              ]
            })
          });
          const groqData = await groqResponse.json();
          if (groqResponse.ok && groqData.choices?.[0]?.message?.content) {
            textoResposta = groqData.choices[0].message.content;
            provedorUsado = "Groq (Fallback)";
          }
        }
      } catch (errGroq) {
        console.log("Groq fallback falhou:", errGroq.message);
      }
    }

    // 3. EMERGÊNCIA ABSOLUTA
    if (!textoResposta) {
      textoResposta = "Olá Samuel! Tivemos uma instabilidade momentânea na conexão, mas já estou voltando ao normal.";
      provedorUsado = "Sistema (Emergência)";
    }

    // 4. GERA O ÁUDIO FEMININO NEURAL
    let audioBase64 = "";
    try {
      audioBase64 = await gerarAudioGoogleTTS(textoResposta);
    } catch (erroAudio) {
      console.log("Aviso: Não foi possível gerar o áudio neural:", erroAudio.message);
    }

    // 5. SALVA NO BANCO DE DADOS
    if (dbColecao) {
      try {
        await dbColecao.insertOne({
          data: new Date(),
          usuario: mensagemUsuario,
          resposta: textoResposta,
          provedor: provedorUsado
        });
        console.log("Interação salva com sucesso no banco de dados.");
      } catch (erroBanco) {
        console.log("Erro ao salvar histórico no MongoDB:", erroBanco.message);
      }
    }

    console.log(`Sucesso! Resposta gerada via: ${provedorUsado}`);

    // RETORNO FINAL PARA O APLICATIVO
    return res.json({ 
      resposta: textoResposta, 
      reply: textoResposta, 
      text: textoResposta,
      audio: audioBase64
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

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira (Online c/ Banco e Voz Neural Ajustada) rodando na porta ${PORT}`);
});
