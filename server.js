const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

// Identidade restrita e limpa para evitar textos gigantes ou asteriscos
const SISTEMA_IDENTIDADE = "Seu nome é Sexta-Feira. Você é a assistente pessoal inteligente, direta, leal e prestativa do Samuel. REGRAS OBRIGATÓRIAS: Responda sempre de forma natural, educada e concisa. NUNCA use asteriscos (*), NUNCA use formatação de markdown como negrito ou itálico nas respostas, NUNCA crie falas teatrais, efeitos sonoros ou histórias de ficção científica, multiverso ou dimensões. Seja prática e vá direto ao ponto.";

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
// FUNÇÕES DE COMUNICAÇÃO COM AS IAs
// ==========================================

// 1. GROQ (Prioridade Principal)
async function chamarGroq(mensagemUsuario, historicoAnterior) {
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
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, temperature: 0.3 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(data.error?.message || "Erro no Groq");
  }
}

// 2. MISTRAL AI (Backup 1)
async function chamarMistral(mensagemUsuario, historicoAnterior) {
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
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mistralKey}` },
    body: JSON.stringify({ model: "mistral-small-latest", messages: messages, temperature: 0.3 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(data.error?.message || "Erro no Mistral");
  }
}

// 3. GEMINI 3.5 FLASH (Backup 2)
async function chamarGemini(mensagemUsuario, historicoAnterior) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("Chave Gemini não configurada");

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
      contents: contents,
      generationConfig: { temperature: 0.3 }
    })
  });

  const data = await response.json();
  if (response.ok) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(data.error?.message || "Erro no Gemini 3.5 Flash");
  }
}

async function gerarAudioEdgeTTS(texto) {
  try {
    // Remove asteriscos e marcações antes de gerar o áudio para o app não ler "asterisco asterisco"
    const textoLimpo = texto.replace(/[*_#`]/g, '');
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(textoLimpo)}&tl=pt-BR&client=tw-ob`;
    const response = await fetch(url);
    if (!response.ok) return "";
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  } catch (erro) {
    return "";
  }
}

app.post('/reconhecer', async (req, res) => {
  try {
    const { imagemBase64 } = req.body;
    if (!imagemBase64) return res.status(400).json({ sucesso: false, mensagem: "Nenhuma imagem enviada." });

    const API_1_URL = process.env.API_1_URL || 'https://api.luxand.cloud/photo/v2';
    const API_1_KEY = process.env.API_1_KEY || '';

    let nomeReconhecido = "Samuel";
    let origemApi = "API Principal";

    try {
      const respostaApi1 = await axios.post(API_1_URL, { image: imagemBase64 }, { headers: { 'token': API_1_KEY } });
      nomeReconhecido = respostaApi1.data.name || 'Samuel';
    } catch (e) {
      origemApi = 'Fallback';
    }

    const textoResposta = `Reconhecimento concluído. Identificado: ${nomeReconhecido}.`;
    let audioBase64 = await gerarAudioEdgeTTS(textoResposta);

    return res.json({ sucesso: true, resposta: textoResposta, reply: textoResposta, text: textoResposta, nome: nomeReconhecido, origem: origemApi, audio: audioBase64 });
  } catch (error) {
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});

async function processarChatUniversal(req, res) {
  if (req.path === '/reconhecer') return;

  try {
    let mensagemUsuario = "";
    if (typeof req.body === 'string' && req.body.trim() !== '') {
      mensagemUsuario = req.body;
    } else if (req.body && typeof req.body === 'object') {
      mensagemUsuario = req.body.mensagem || req.body.message || req.body.text || req.body.query || Object.values(req.body)[0] || "";
    }

    if (!mensagemUsuario && req.query) {
      mensagemUsuario = req.query.mensagem || req.query.text || "";
    }

    if (typeof mensagemUsuario === 'object') mensagemUsuario = JSON.stringify(mensagemUsuario);
    mensagemUsuario = (mensagemUsuario || "Oi, Sexta-Feira, está me ouvindo?").trim();

    const historicoRecente = await buscarHistoricoRecente();
    let textoResposta = "";
    let provedorUsado = "";

    const ordemExecucao = [
      { nome: "Groq", funcao: () => chamarGroq(mensagemUsuario, historicoRecente) },
      { nome: "Mistral AI", funcao: () => chamarMistral(mensagemUsuario, historicoRecente) },
      { nome: "Gemini 3.5 Flash", funcao: () => chamarGemini(mensagemUsuario, historicoRecente) }
    ];

    for (const item of ordemExecucao) {
      try {
        console.log(`Tentando processar via ${item.nome}...`);
        textoResposta = await item.funcao();
        if (textoResposta) {
          provedorUsado = item.nome;
          break;
        }
      } catch (errApi) {
        console.log(`${item.nome} falhou (${errApi.message}), tentando próxima...`);
      }
    }

    if (!textoResposta) {
      textoResposta = "Oi Samuel, estou ouvindo. Como posso ajudar?";
      provedorUsado = "Sistema (Emergência)";
    }

    // Limpeza extra para garantir que nenhum asterisco vá para o app ou para o TTS
    let textoLimpoFinal = textoResposta.replace(/[*_#`]/g, '');

    let audioBase64 = "";
    try { audioBase64 = await gerarAudioEdgeTTS(textoLimpoFinal); } catch (e) {}

    if (dbColecao) {
      try {
        await dbColecao.insertOne({ data: new Date(), usuario: mensagemUsuario, resposta: textoLimpoFinal, provedor: provedorUsado });
      } catch (e) {}
    }

    console.log(`Sucesso! Resposta gerada via: ${provedorUsado}`);

    return res.json({ resposta: textoLimpoFinal, reply: textoLimpoFinal, text: textoLimpoFinal, audio: audioBase64 });
  } catch (error) {
    return res.json({ resposta: `Erro interno: ${error.message}`, reply: `Erro interno: ${error.message}`, text: `Erro interno: ${error.message}` });
  }
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
