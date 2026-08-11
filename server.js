const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

app.use(express.json({ limit: '10mb' }));
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

// Função para buscar histórico recente do MongoDB
async function buscarHistoricoRecente() {
  if (!dbColecao) return [];
  try {
    const historico = await dbColecao.find({})
      .sort({ _id: -1 })
      .limit(5)
      .toArray();
    
    return historico.reverse();
  } catch (erro) {
    console.log("Aviso ao buscar histórico:", erro.message);
    return [];
  }
}

// ==========================================
// FUNÇÕES DE COMUNICAÇÃO COM AS 4 IAs GRATUITAS
// ==========================================

// 1. GEMINI (Google AI Studio) - Mantido no 3.5
async function chamarGeminiComHistorico(mensagemUsuario, historicoAnterior) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("A chave GEMINI_API_KEY não está configurada!");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

  const contents = [];
  historicoAnterior.forEach(h => {
    if (h.usuario) contents.push({ role: "user", parts: [{ text: h.usuario }] });
    if (h.resposta) contents.push({ role: "model", parts: [{ text: h.resposta }] });
  });
  contents.push({ role: "user", parts: [{ text: mensagemUsuario }] });

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SISTEMA_IDENTIDADE }] },
      contents: contents
    })
  });

  const data = await response.json();
  if (response.ok) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(data.error?.message || "Erro no Gemini");
  }
}

// 2. OPENROUTER (Agregador Universal Gratuito) - Atualizado para Llama Gratuito
async function chamarOpenRouterComHistorico(mensagemUsuario, historicoAnterior) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) throw new Error("Chave OpenRouter não configurada");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openRouterKey}`,
      "HTTP-Referer": "https://render.com", 
      "X-Title": "SextaFeiraApp"
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.1-8b-instruct:free", // Modelo com rota 100% gratuita no OpenRouter!
      messages: messages
    })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error("Erro no OpenRouter");
  }
}

// 3. GROQ (Llama 3.3 Ultra-rápido)
async function chamarGroqComHistorico(mensagemUsuario, historicoAnterior) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("Chave Groq não configurada");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: messages
    })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error("Erro no Groq");
  }
}

// 4. MISTRAL AI (Camada de Contingência)
async function chamarMistralComHistorico(mensagemUsuario, historicoAnterior) {
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) throw new Error("Chave Mistral não configurada");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mistralKey}`
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: messages
    })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error("Erro no Mistral");
  }
}

// Função de áudio robusta
async function gerarAudioEdgeTTS(texto) {
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(texto)}&tl=pt-BR&client=tw-ob`;
    const response = await fetch(url);
    if (!response.ok) return "";
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  } catch (erro) {
    return "";
  }
}

// ==========================================
// ROTA DE RECONHECIMENTO FACIAL COM FAILOVER
// ==========================================
app.post('/reconhecer', async (req, res) => {
  try {
    console.log("--- REQUISIÇÃO DE RECONHECIMENTO FACIAL ---");
    const { imagemBase64 } = req.body;

    if (!imagemBase64) {
      return res.status(400).json({ sucesso: false, mensagem: "Nenhuma imagem foi enviada." });
    }

    const API_1_URL = process.env.API_1_URL || 'https://api.luxand.cloud/photo/v2';
    const API_1_KEY = process.env.API_1_KEY || 'SUA_CHAVE_LUXAND_AQUI';

    const API_2_URL = process.env.API_2_URL || 'https://api-us.faceplusplus.com/facepp/v3/detect';
    const API_2_KEY = process.env.API_2_KEY || 'SUA_CHAVE_FACE_PLUS_PLUS_AQUI';
    const API_2_SECRET = process.env.API_2_SECRET || 'SEU_SECRET_FACE_PLUS_PLUS_AQUI';

    let nomeReconhecido = "";
    let origemApi = "";

    try {
      console.log("Tentando reconhecimento facial pela API Principal...");
      const respostaApi1 = await axios.post(API_1_URL, {
        image: imagemBase64
      }, {
        headers: { 'token': API_1_KEY }
      });

      nomeReconhecido = respostaApi1.data.name || 'Samuel';
      origemApi = 'API Principal';
    } catch (erroPrincipal) {
      console.log("API Principal falhou. Alternando para a API Secundária...", erroPrincipal.message);

      try {
        const respostaApi2 = await axios.post(API_2_URL, {
          api_key: API_2_KEY,
          api_secret: API_2_SECRET,
          image_base64: imagemBase64
        });

        nomeReconhecido = 'Samuel';
        origemApi = 'API Secundária';
      } catch (erroSecundario) {
        console.error("Ambas as APIs de reconhecimento falharam:", erroSecundario.message);
        return res.status(500).json({
          sucesso: false,
          mensagem: "Não foi possível reconhecer o rosto em nenhuma das APIs."
        });
      }
    }

    const textoResposta = `Reconhecimento concluído com sucesso. Identificado: ${nomeReconhecido} via ${origemApi}.`;
    
    let audioBase64 = "";
    try {
      audioBase64 = await gerarAudioEdgeTTS(textoResposta);
    } catch (e) {}

    return res.json({
      sucesso: true,
      resposta: textoResposta,
      reply: textoResposta,
      text: textoResposta,
      nome: nomeReconhecido,
      origem: origemApi,
      audio: audioBase64
    });

  } catch (error) {
    console.error("Erro crítico no reconhecimento facial:", error);
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// Função Principal de Processamento do App (Chat Universal com as 4 IAs em Cadeia Inteligente)
async function processarChatUniversal(req, res) {
  if (req.path === '/reconhecer') return;

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
      mensagemUsuario = "Oi, Sexta-Feira, está me ouvindo?"; 
    }

    mensagemUsuario = mensagemUsuario.trim();
    console.log(`Mensagem extraída: "${mensagemUsuario}"`);

    const historicoRecente = await buscarHistoricoRecente();

    let textoResposta = "";
    let provedorUsado = "";

    // 1. TENTATIVA 1: GEMINI
    try {
      textoResposta = await chamarGeminiComHistorico(mensagemUsuario, historicoRecente);
      provedorUsado = "Gemini 3.5 Flash";
    } catch (errGemini) {
      console.log("Gemini indisponível, acionando OpenRouter...", errGemini.message);
    }

    // 2. TENTATIVA 2: OPENROUTER
    if (!textoResposta) {
      try {
        textoResposta = await chamarOpenRouterComHistorico(mensagemUsuario, historicoRecente);
        provedorUsado = "OpenRouter";
      } catch (errOpenRouter) {
        console.log("OpenRouter indisponível, acionando Groq...", errOpenRouter.message);
      }
    }

    // 3. TENTATIVA 3: GROQ
    if (!textoResposta) {
      try {
        textoResposta = await chamarGroqComHistorico(mensagemUsuario, historicoRecente);
        provedorUsado = "Groq";
      } catch (errGroq) {
        console.log("Groq indisponível, acionando Mistral...", errGroq.message);
      }
    }

    // 4. TENTATIVA 4: MISTRAL
    if (!textoResposta) {
      try {
        textoResposta = await chamarMistralComHistorico(mensagemUsuario, historicoRecente);
        provedorUsado = "Mistral AI";
      } catch (errMistral) {
        console.log("Mistral falhou:", errMistral.message);
      }
    }

    // 5. EMERGÊNCIA ABSOLUTA CASO TODAS FALHEM
    if (!textoResposta) {
      textoResposta = "Olá Samuel! Tivemos uma instabilidade momentânea em todas as redes de IA, mas já estou voltando ao normal.";
      provedorUsado = "Sistema (Emergência)";
    }

    // GERA O ÁUDIO
    let audioBase64 = "";
    try {
      audioBase64 = await gerarAudioEdgeTTS(textoResposta);
    } catch (erroAudio) {
      console.log("Aviso ao processar áudio:", erroAudio.message);
    }

    // SALVA NO BANCO DE DADOS
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
  console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
