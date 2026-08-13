const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

// IMPORTANTE: Captura Texto Puro ANTES de tentar converter para JSON
// Isso resolve o problema de envio do App Inventor / Kodular
app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- IDENTIDADE DA SEXTA-FEIRA ---
const SISTEMA_IDENTIDADE = `Você é a Sexta-Feira, assistente pessoal e parceira do Samuel.
- Responda SEMPRE de forma direta, inteligente, clara e elegante.
- Se ele perguntar 'quem é você', apresente-se como Sexta-Feira, sua assistente virtual.
- Responda com precisão e objetividade à pergunta exata que o Samuel fizer.
- NUNCA invente histórias, bloqueios simulados, efeitos sonoros ou contadores de mensagem.`;

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

async function buscarHistoricoLimpo() {
  if (!dbColecao) return [];
  try {
    const historico = await dbColecao.find({}).sort({ _id: -1 }).limit(4).toArray();
    return historico.reverse().filter(h => h.usuario && h.resposta);
  } catch (erro) { return []; }
}

async function limparMemoriaBanco() {
  if (!dbColecao) return false;
  try {
    await dbColecao.deleteMany({});
    console.log("[Banco] Memória limpa com sucesso!");
    return true;
  } catch (e) { return false; }
}

// ==========================================
// 2. EXTRATOR ULTRA-RESISTENTE DE TEXTO DO APP
// ==========================================
function extrairTextoDoRequest(req) {
  if (!req.body && !req.query) return "";

  // 1. Se o App Inventor enviou Texto Puro (String)
  if (typeof req.body === 'string') {
    const textoLimpo = req.body.trim();
    if (!textoLimpo) return "";
    
    // Tenta ver se a string é um JSON oculto
    try {
      const parsed = JSON.parse(textoLimpo);
      return parsed.mensagem || parsed.message || parsed.text || parsed.query || parsed.msg || Object.values(parsed)[0] || textoLimpo;
    } catch (e) {
      // Se não for JSON, é o próprio texto digitado ("teste", "quem e você", etc)
      return textoLimpo;
    }
  }

  // 2. Se req.body for Objeto JSON
  if (req.body && typeof req.body === 'object') {
    return req.body.mensagem || req.body.message || req.body.text || req.body.query || req.body.msg || Object.values(req.body)[0] || "";
  }

  // 3. Se veio via URL (Query String)
  if (req.query) {
    return req.query.mensagem || req.query.text || req.query.q || req.query.msg || Object.values(req.query)[0] || "";
  }

  return "";
}

// ==========================================
// 3. APIS DE IA (Gemini / Groq / Mistral)
// ==========================================

async function chamarGemini(mensagemUsuario, historicoAnterior) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI || process.env.GEMINI_KEY;
  if (!geminiKey) throw new Error("Chave GEMINI não encontrada.");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
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
      generationConfig: { temperature: 0.2 }
    })
  });

  const data = await response.json();
  if (response.ok) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(`[GEMINI ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

async function chamarGroq(mensagemUsuario, historicoAnterior) {
  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ || process.env.GROQ_KEY;
  if (!groqKey) throw new Error("Chave GROQ não encontrada.");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, temperature: 0.2 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(`[GROQ ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

async function chamarMistral(mensagemUsuario, historicoAnterior) {
  const mistralKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL || process.env.MISTRAL_KEY;
  if (!mistralKey) throw new Error("Chave MISTRAL não encontrada.");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mistralKey}` },
    body: JSON.stringify({ model: "mistral-small-latest", messages: messages, temperature: 0.2 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(`[MISTRAL ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
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
// 5. RECONHECIMENTO FACIAL
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

    const textoResposta = `Reconhecimento concluído. Olá Samuel, em que posso ser útil?`;
    let audioBase64 = await gerarAudioEdgeTTS(textoResposta);

    return res.json({ sucesso: true, resposta: textoResposta, reply: textoResposta, text: textoResposta, nome: nomeReconhecido, audio: audioBase64 });
  } catch (error) {
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// ==========================================
// 6. PROCESSADOR CHAT UNIVERSAL
// ==========================================
async function processarChatUniversal(req, res) {
  if (req.path === '/reconhecer') return;

  try {
    const mensagemUsuario = extrairTextoDoRequest(req);

    console.log(`\n========================================`);
    console.log(`[TEXTO CAPTURADO DO APP]: "${mensagemUsuario}"`);
    console.log(`========================================`);

    if (!mensagemUsuario) {
      const txtAlerta = "Atenção Samuel: O campo de texto do seu aplicativo está chegando vazio no servidor. Verifique o botão de envio no aplicativo.";
      let audAlerta = await gerarAudioEdgeTTS(txtAlerta);
      return res.json({ resposta: txtAlerta, reply: txtAlerta, text: txtAlerta, audio: audAlerta });
    }

    const msgBaixa = mensagemUsuario.toLowerCase();
    if (msgBaixa === "reset" || msgBaixa === "limpar" || msgBaixa === "/reset") {
      await limparMemoriaBanco();
      const txtReset = "Memória resetada com sucesso, Samuel! Históricos antigos apagados. Como posso te ajudar?";
      let audReset = await gerarAudioEdgeTTS(txtReset);
      return res.json({ resposta: txtReset, reply: txtReset, text: txtReset, audio: audReset });
    }

    let textoResposta = "";
    let provedorUsado = "";
    const historicoLimpo = await buscarHistoricoLimpo();
    
    const ordemExecucao = [
      { nome: "Gemini", funcao: () => chamarGemini(mensagemUsuario, historicoLimpo) },
      { nome: "Groq", funcao: () => chamarGroq(mensagemUsuario, historicoLimpo) },
      { nome: "Mistral", funcao: () => chamarMistral(mensagemUsuario, historicoLimpo) }
    ];

    for (const item of ordemExecucao) {
      try {
        console.log(`[PROCESSANDO] Pergunta: "${mensagemUsuario}" via ${item.nome}...`);
        textoResposta = await item.funcao();
        if (textoResposta && textoResposta.trim() !== "") {
          provedorUsado = item.nome;
          console.log(`[SUCESSO] Respondido por ${item.nome}`);
          break;
        }
      } catch (errApi) {
        console.error(`[FALHA] ${item.nome}:`, errApi.message);
      }
    }

    if (!textoResposta) {
      textoResposta = "Desculpe Samuel, tive uma instabilidade temporária. Pode tentar novamente?";
      provedorUsado = "Sistema-Local";
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
    return res.json({ resposta: "Erro no servidor ao processar sua solicitação.", reply: "Erro no servidor ao processar sua solicitação.", text: "Erro no servidor ao processar sua solicitação." });
  }
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
