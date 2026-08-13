const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

const SISTEMA_IDENTIDADE = "Seu nome é Sexta-Feira. Você é a assistente pessoal e grande parceira do Samuel. Você conversa de forma totalmente natural, humana, amigável, inteligente e prestativa. Responda sempre diretamente às perguntas do Samuel sem rodeios, ajude no que ele precisar, demonstre interesse pelo dia dele, lembre-se das conversas e interaja com carinho e lealdade.";

// ==========================================
// 1. BANCO DE DADOS (MongoDB Atlas)
// ==========================================
const mongoUri = process.env.MONGO_URI;
let dbColecao = null;

async function conectarBanco() {
  if (!mongoUri) return;
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    dbColecao = client.db("sexta_feira_db").collection("memorias");
    console.log("[Banco] Conectado ao MongoDB Atlas com sucesso!");
  } catch (erro) {
    console.error("[ERRO BANCO] Falha ao conectar no MongoDB:", erro.message);
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
// 2. ECONOMIA DE API (Triagem Local)
// ==========================================
function triagemLocal(mensagem) {
  const msg = (mensagem || "").trim().toLowerCase();

  if (msg === "oi" || msg === "olá" || msg === "ola" || msg === "hey") {
    return "Opa Samuel! Fala comigo, como estão as coisas?";
  }
  if (msg.includes("bom dia")) {
    return "Bom dia, Samuel! Que seu dia seja abençoado e muito produtivo nos corres!";
  }
  if (msg.includes("boa tarde")) {
    return "Boa tarde, Samuel! Como estão os agendamentos e o trabalho por aí?";
  }
  if (msg.includes("boa noite")) {
    return "Boa noite, Samuel! Tarde de trabalho finalizada ou ainda no corre? Se precisar, estou por aqui!";
  }
  if (msg.includes("tudo bem") || msg.includes("como voce ta") || msg.includes("como você está")) {
    return "Tudo ótimo por aqui com nossos sistemas, Samuel! E com você, como está sendo o dia?";
  }
  if (msg === "obrigado" || msg === "valeu" || msg === "tmj") {
    return "Tamo junto demais, Samuel! Sempre que precisar, é só chamar.";
  }

  return null;
}

function gerarRespostaEmergencia(mensagem) {
  return "Samuel, recebi sua mensagem! Nossos sistemas de IA deram uma pausa rápida, mas estou aqui online com você. O que manda?";
}

// ==========================================
// 3. PROVEDORES DE IA (Multi-APIs em Cascata)
// ==========================================

// --- PROVEDOR 1: GEMINI (3.5 Flash) ---
async function chamarGemini(mensagemUsuario, historicoAnterior) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GEMIN_KEY;
  if (!geminiKey) throw new Error("Chave GEMINI não configurada.");

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
      generationConfig: { temperature: 0.7 }
    })
  });

  const data = await response.json();
  if (response.ok) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(`[GEMINI ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// --- PROVEDOR 2: GROQ (Llama 3.3 70B) ---
async function chamarGroq(mensagemUsuario, historicoAnterior) {
  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
  if (!groqKey) throw new Error("Chave GROQ não configurada.");

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
    throw new Error(`[GROQ ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// --- PROVEDOR 3: MISTRAL AI ---
async function chamarMistral(mensagemUsuario, historicoAnterior) {
  const mistralKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL_KEY || process.env.MISTR_KEY;
  if (!mistralKey) throw new Error("Chave MISTRAL não configurada.");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mistralKey}` },
    body: JSON.stringify({ model: "mistral-small-latest", messages: messages, temperature: 0.7 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(`[MISTRAL ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// --- PROVEDOR 4: OPENROUTER ---
async function chamarOpenRouter(mensagemUsuario, historicoAnterior) {
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || process.env.OPENR_KEY;
  if (!openrouterKey) throw new Error("Chave OPENROUTER não configurada.");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openrouterKey}` },
    body: JSON.stringify({ model: "meta-llama/llama-3.3-70b-instruct:free", messages: messages, temperature: 0.7 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(`[OPENROUTER ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// --- PROVEDOR 5: HUGGING FACE ---
async function chamarHuggingFace(mensagemUsuario) {
  const hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HUGGING_FACE_KEY || process.env.HUGGI_KEY;
  if (!hfKey) throw new Error("Chave HUGGINGFACE não configurada.");

  const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hfKey}` },
    body: JSON.stringify({ inputs: `<s>[INST] ${SISTEMA_IDENTIDADE}\n\nSamuel diz: ${mensagemUsuario} [/INST]` })
  });

  const data = await response.json();
  if (response.ok && Array.isArray(data) && data[0]?.generated_text) {
    const textoGerado = data[0].generated_text;
    const partes = textoGerado.split("[/INST]");
    return partes[partes.length - 1].trim();
  } else {
    throw new Error(`[HUGGINGFACE ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// ==========================================
// 4. VOZ (Edge TTS)
// ==========================================
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

// ==========================================
// 5. ROTA DE RECONHECIMENTO FACIAL (Luxand)
// ==========================================
app.post('/reconhecer', async (req, res) => {
  try {
    const { imagemBase64 } = req.body;
    if (!imagemBase64) return res.status(400).json({ sucesso: false, mensagem: "Nenhuma imagem enviada." });

    const API_1_URL = process.env.API_1_URL || 'https://api.luxand.cloud/photo/v2';
    const API_1_KEY = process.env.API_1_KEY || process.env.API_1_TOKEN || '';

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

// ==========================================
// 6. PROCESSADOR UNIVERSAL DO CHAT
// ==========================================
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

    console.log(`\n========================================`);
    console.log(`[RASTREIO] Nova mensagem: "${mensagemUsuario}"`);
    console.log(`========================================`);

    let textoResposta = "";
    let provedorUsado = "";

    // FILTRO LOCAL (Economia de tokens)
    const respostaTriagem = triagemLocal(mensagemUsuario);
    if (respostaTriagem) {
      textoResposta = respostaTriagem;
      provedorUsado = "Filtro-Local-Economico";
      console.log(`[ECONOMIA] Respondido via Triagem Local sem gastar API.`);
    } else {
      // EXECUÇÃO EM CASCATA DAS APIS
      const historicoRecente = await buscarHistoricoRecente();
      const ordemExecucao = [
        { nome: "Gemini", funcao: () => chamarGemini(mensagemUsuario, historicoRecente) },
        { nome: "Groq", funcao: () => chamarGroq(mensagemUsuario, historicoRecente) },
        { nome: "Mistral", funcao: () => chamarMistral(mensagemUsuario, historicoRecente) },
        { nome: "OpenRouter", funcao: () => chamarOpenRouter(mensagemUsuario, historicoRecente) },
        { nome: "HuggingFace", funcao: () => chamarHuggingFace(mensagemUsuario) }
      ];

      for (const item of ordemExecucao) {
        try {
          console.log(`[RASTREIO] Tentando via ${item.nome}...`);
          textoResposta = await item.funcao();
          if (textoResposta && textoResposta.trim() !== "") {
            provedorUsado = item.nome;
            console.log(`[RASTREIO SUCESSO] Resposta gerada via: ${item.nome}`);
            break;
          }
        } catch (errApi) {
          console.error(`[RASTREIO FALHA] ${item.nome} falhou:`, errApi.message);
        }
      }

      if (!textoResposta) {
        console.warn(`[RASTREIO AVISO] Todas as APIs falharam. Usando gerador local de emergência.`);
        textoResposta = gerarRespostaEmergencia(mensagemUsuario);
        provedorUsado = "Sistema-Local-Emergencia";
      }
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
    console.error(`[ERRO CRÍTICO NO CHAT]:`, error.message);
    return res.json({ resposta: "Opa Samuel, deu um pequeno erro no servidor. Me mande de novo por favor?", reply: "Opa Samuel, deu um pequeno erro no servidor. Me mande de novo por favor?", text: "Opa Samuel, deu um pequeno erro no servidor. Me mande de novo por favor?" });
  }
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
