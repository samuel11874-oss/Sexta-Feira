const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

// Identidade ultra humana e natural
const SISTEMA_IDENTIDADE = "Seu nome é Sexta-Feira. Você é a assistente pessoal e grande parceira do Samuel. Você conversa de forma totalmente natural, humana, amigável, inteligente e prestativa. Responda sempre diretamente às perguntas do Samuel sem rodeios, ajude no que ele precisar, demonstre interesse pelo dia dele, lembre-se das conversas e interaja com carinho e lealdade.";

const mongoUri = process.env.MONGO_URI;
let dbColecao = null;

async function conectarBanco() {
  if (!mongoUri) return;
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
    const historico = await dbColecao.find({}).sort({ _id: -1 }).limit(6).toArray();
    return historico.reverse();
  } catch (erro) { return []; }
}

// ==========================================
// FUNÇÕES DE COMUNICAÇÃO COM AS IAs (CORRIGIDAS)
// ==========================================

// 1. HUGGING FACE (Corrigido para o novo endpoint OpenAI-compatible)
async function chamarHuggingFace(mensagemUsuario, historicoAnterior) {
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) throw new Error("Chave Hugging Face não configurada");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://api-inference.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hfKey}` },
    body: JSON.stringify({
      model: "meta-llama/Meta-Llama-3-8B-Instruct",
      messages: messages,
      max_tokens: 300,
      temperature: 0.7
    })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(data.error?.message || "Erro na Hugging Face");
  }
}

// 2. GROQ
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
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, temperature: 0.7 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(data.error?.message || "Erro no Groq");
  }
}

// 3. GEMINI 1.5 FLASH (Corrigido endpoint)
async function chamarGemini(mensagemUsuario, historicoAnterior) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("Chave Gemini não configurada");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
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
      generationConfig: { temperature: 0.7 }
    })
  });

  const data = await response.json();
  if (response.ok) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(data.error?.message || "Erro no Gemini");
  }
}

// Voz Humana Neural via Edge TTS (Francisca)
async function gerarAudioEdgeTTS(texto) {
  try {
    const textoLimpo = texto.replace(/[*_#`]/g, '');
    const voice = "pt-BR-FranciscaNeural";
    const url = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    
    const body = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">
                    <voice name="${voice}">
                      <prosody rate="1.0" pitch="0%">${textoLimpo}</prosody>
                    </voice>
                  </speak>`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/ssml+xml" },
      body: body
    });

    if (!response.ok) return "";
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  } catch (erro) { return ""; }
}

app.post('/reconhecer', async (req, res) => {
  try {
    const { imagemBase64 } = req.body;
    if (!imagemBase64) return res.status(400).json({ sucesso: false, mensagem: "Nenhuma imagem enviada." });

    const API_1_URL = process.env.API_1_URL || 'https://api.luxand.cloud/photo/v2';
    const API_1_KEY = process.env.API_1_KEY || '';

    let nomeReconhecido = "Samuel";
    try {
      const respostaApi1 = await axios.post(API_1_URL, { image: imagemBase64 }, { headers: { 'token': API_1_KEY } });
      nomeReconhecido = respostaApi1.data.name || 'Samuel';
    } catch (e) {}

    const textoResposta = `Opa, Samuel! Reconhecimento facial concluído.`;
    let audioBase64 = await gerarAudioEdgeTTS(textoResposta);

    return res.json({ sucesso: true, resposta: textoResposta, reply: textoResposta, text: textoResposta, nome: nomeReconhecido, audio: audioBase64 });
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
    mensagemUsuario = (mensagemUsuario || "Oi").trim();

    const historicoRecente = await buscarHistoricoRecente();
    let textoResposta = "";
    let provedorUsado = "";

    // ORDEM DE REDUNDÂNCIA AUTOMÁTICA: Hugging Face -> Groq -> Gemini
    const ordemExecucao = [
      { nome: "HuggingFace", funcao: () => chamarHuggingFace(mensagemUsuario, historicoRecente) },
      { nome: "Groq", funcao: () => chamarGroq(mensagemUsuario, historicoRecente) },
      { nome: "Gemini", funcao: () => chamarGemini(mensagemUsuario, historicoRecente) }
    ];

    for (const item of ordemExecucao) {
      try {
        console.log(`Tentando processar via ${item.nome}...`);
        textoResposta = await item.funcao();
        if (textoResposta && textoResposta.trim() !== "") {
          provedorUsado = item.nome;
          console.log(`Sucesso! Resposta gerada via: ${item.nome}`);
          break;
        }
      } catch (errApi) {
        console.log(`${item.nome} falhou: ${errApi.message}. Tentando próxima API...`);
      }
    }

    if (!textoResposta) {
      textoResposta = "Oi Samuel! Estou aqui com você. Pode falar, do que precisa?";
      provedorUsado = "Sistema";
    }

    let textoLimpoFinal = textoResposta.replace(/[*_#`]/g, '');
    let audioBase64 = "";
    try { audioBase64 = await gerarAudioEdgeTTS(textoLimpoFinal); } catch (e) {}

    if (dbColecao) {
      try {
        await dbColecao.insertOne({ data: new Date(), usuario: mensagemUsuario, resposta: textoLimpoFinal, provedor: provedorUsado });
      } catch (e) {}
    }

    return res.json({ resposta: textoLimpoFinal, reply: textoLimpoFinal, text: textoLimpoFinal, audio: audioBase64 });
  } catch (error) {
    return res.json({ resposta: "Opa Samuel, deu um pequeno erro no servidor. Me mande de novo por favor?", reply: "Opa Samuel, deu um pequeno erro no servidor. Me mande de novo por favor?", text: "Opa Samuel, deu um pequeno erro no servidor. Me mande de novo por favor?" });
  }
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
