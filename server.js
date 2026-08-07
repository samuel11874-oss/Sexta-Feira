const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

// Identidade fixa e inegociável da assistente
const SISTEMA_IDENTIDADE = "Você se chama Sexta-Feira. Você é a assistente pessoal inteligente e prestativa do Samuel. Nunca esqueça sua identidade: seu nome é Sexta-Feira.";

// Configuração do MongoDB para Memória de Longo Prazo
const mongoUri = process.env.MONGO_URI;
let dbClient = null;
let dbColecao = null;

async function conectarBanco() {
  if (!mongoUri) {
    console.log("AVISO: MONGO_URI não configurada. O armazenamento de longo prazo está desativado.");
    return;
  }
  try {
    if (!dbClient) {
      dbClient = new MongoClient(mongoUri);
      await dbClient.connect();
      const database = dbClient.db("sexta_feira_db");
      dbColecao = database.collection("memorias");
      console.log("Conectado ao MongoDB Atlas com sucesso!");
    }
  } catch (erro) {
    console.error("Erro ao conectar no MongoDB:", erro.message);
  }
}

conectarBanco();

async function processarChatUniversal(req, res) {
  try {
    console.log("--- NOVA REQUISIÇÃO RECEBIDA DO APP ---");
    let mensagemUsuario = "";

    if (typeof req.body === 'string' && req.body.trim() !== '') {
      mensagemUsuario = req.body;
    } else if (req.body && typeof req.body === 'object') {
      mensagemUsuario = req.body.mensagem || req.body.message || req.body.text || req.body.query || req.body.value || req.body.prompt;
      if (!mensagemUsuario) {
        const chaves = Object.keys(req.body);
        if (chaves.length > 0 && chaves[0] !== '') {
          mensagemUsuario = chaves[0];
        } else {
          mensagemUsuario = Object.values(req.body)[0];
        }
      }
    }

    if (!mensagemUsuario && req.query) {
      mensagemUsuario = req.query.mensagem || req.query.text || req.query.q || req.query.message;
      if (!mensagemUsuario) {
        const queryChaves = Object.keys(req.query);
        if (queryChaves.length > 0) mensagemUsuario = queryChaves[0];
      }
    }

    if (typeof mensagemUsuario === 'object' && mensagemUsuario !== null) {
      mensagemUsuario = JSON.stringify(mensagemUsuario);
    }

    if (!mensagemUsuario || typeof mensagemUsuario !== 'string' || mensagemUsuario.trim() === "") {
      console.log("ALERTA: Nenhuma mensagem identificada.");
      return res.json({ 
        resposta: "Erro: Nenhuma mensagem foi encontrada.", 
        reply: "Erro: Nenhuma mensagem foi encontrada.",
        text: "Erro: Nenhuma mensagem foi encontrada." 
      });
    }

    mensagemUsuario = mensagemUsuario.trim();
    console.log(`Mensagem extraída: "${mensagemUsuario}"`);

    let textoResposta = "";
    let provedorUsado = "";

    // 1. TENTA GEMINI 3.5 PRIMEIRO (Com sistema de Retry automático)
    try {
      textoResposta = await chamarGeminiComRetry(mensagemUsuario);
      provedorUsado = "Gemini 3.5 Flash (Principal)";
    } catch (errGemini) {
      console.log("Gemini ocupado, acionando Groq como fallback...", errGemini.message);
    }

    // 2. SE O GEMINI FALHAR, O GROQ ASSUME AUTOMATICAMENTE
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
            provedorUsado = "Groq (Fallback Ativo)";
          }
        }
      } catch (errGroq) {
        console.log("Groq fallback também falhou:", errGroq.message);
      }
    }

    // 3. EMERGÊNCIA ABSOLUTA
    if (!textoResposta) {
      textoResposta = "Olá Samuel! Sou a Sexta-Feira. Tivemos uma instabilidade momentânea nas redes neurais, mas já estou pronta para ajudar novamente.";
      provedorUsado = "Sistema (Emergência)";
    }

    // GERA O ÁUDIO FEMININO VIA GOOGLE TEXT-TO-SPEECH
    let audioBase64 = "";
    try {
      audioBase64 = await gerarAudioGoogleTTS(textoResposta);
    } catch (erroAudio) {
      console.log("Aviso: Não foi possível gerar o áudio neural:", erroAudio.message);
    }

    // SALVA NO BANCO DE DADOS (MEMÓRIA)
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

    // Retorna a resposta em texto e também o áudio em formato base64 para o app reproduzir
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

// Função base do Gemini 3.5 Flash
async function chamarGemini(mensagemUsuario) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error("A chave GEMINI_API_KEY não está configurada!");
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

  const geminiResponse = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SISTEMA_IDENTIDADE }]
      },
      contents: [{ parts: [{ text: mensagemUsuario }] }]
    })
  });

  const geminiData = await geminiResponse.json();
  if (geminiResponse.ok) {
    return geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta do Gemini.";
  } else {
    const erroMsg = geminiData.error?.message || JSON.stringify(geminiData);
    throw new Error(`Google API Error: ${erroMsg}`);
  }
}

// Retry automático para o Gemini antes de passar para o Groq
async function chamarGeminiComRetry(mensagemUsuario) {
  try {
    return await chamarGemini(mensagemUsuario);
  } catch (error) {
    if (error.message.includes("high demand")) {
      console.log("Pico de alta demanda no Gemini. Tentando novamente em 1 segundo...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await chamarGemini(mensagemUsuario);
    }
    throw error;
  }
}

// Função para converter texto em áudio usando o Google Text-to-Speech
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
        name: "pt-BR-Neural2-A", // Voz neural feminina de alta qualidade do Google
        ssmlGender: "FEMALE"
      },
      audioConfig: {
        audioEncoding: "MP3"
      }
    })
  });

  const data = await response.json();
  if (response.ok && data.audioContent) {
    return data.audioContent; // Retorna o áudio em formato Base64 pronto para o app tocar
  }
  return "";
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira (Com Voz Neural Feminina, Banco e IA Dupla) rodando na porta ${PORT}`);
});
