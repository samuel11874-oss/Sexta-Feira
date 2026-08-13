const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

// ==========================================
// 1. REGRA DE SEGURANÇA (CORS) NO TOPO ABSOLUTO
// Libera o Spck Editor / Navegador para conectar
// ==========================================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parsers para ler os dados enviados pelo aplicativo
app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// 2. PERFIL E IDENTIDADE DA SEXTA-FEIRA
// ==========================================
const PERFIL_SAMUEL = `
[DADOS E PERFIL DO USUÁRIO - SAMUEL]
- Nome Completo: Samuel da Silva Pereira.
- Papel do Usuário: Você é a assistente pessoal dedicada, inteligente e de total confiança do Samuel.
- Conhecimento Geral: Você conhece a rotina do Samuel, seus projetos de automação, sua família e suas preferências.
- Comportamento: Responda de forma próxima, altamente inteligente, direta e leal. Nunca diga que tem 'acesso limitado' ou que 'é apenas uma IA sem dados'. Trate-se como a assistente pessoal dele integrada ao sistema dele.
`;

const IDENTIDADE_PADRAO = `Você é a Sexta-Feira, assistente pessoal e inteligência artificial exclusiva do Samuel.

${PERFIL_SAMUEL}

[DIRETRIZES DE RESPOSTA]
1. Responda SEMPRE de forma direta, clara, objetiva e inteligente à pergunta exata do Samuel.
2. NUNCA diga 'tenho acesso limitado às suas informações'. Você é a assistente pessoal dele.
3. Se ele perguntar 'o que você sabe sobre mim', use as informações do perfil dele e a memória para responder.`;

const IDENTIDADE_LIVE = `Você é a Sexta-Feira no MODO LIVE com o Samuel.

${PERFIL_SAMUEL}

[DIRETRIZES DO MODO LIVE]
1. Responda como se estivesse em uma LIGAÇÃO TELEFÔNICA em tempo real.
2. Seja extremamente concisa, natural e fluida (respostas curtas de no máximo 1 a 3 frases).
3. NUNCA use tópicos, listas, símbolos de formatação (como markdown *, #) ou respostas longas.`;

// ==========================================
// 3. BANCO DE DADOS (MongoDB Atlas)
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
    const historico = await dbColecao.find({}).sort({ _id: -1 }).limit(6).toArray();
    return historico.reverse().filter(h => h.usuario && h.resposta);
  } catch (e) { return []; }
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
// 4. EXTRATOR UNIVERSAL DE TEXTO
// ==========================================
function extrairTextoDoRequest(req) {
  if (!req.body && !req.query) return "";

  if (typeof req.body === 'string') {
    const textoLimpo = req.body.trim();
    if (!textoLimpo) return "";
    try {
      const parsed = JSON.parse(textoLimpo);
      return parsed.mensagem || parsed.message || parsed.text || parsed.query || parsed.msg || Object.values(parsed)[0] || textoLimpo;
    } catch (e) {
      return textoLimpo;
    }
  }

  if (req.body && typeof req.body === 'object') {
    return req.body.mensagem || req.body.message || req.body.text || req.body.query || req.body.msg || Object.values(req.body)[0] || "";
  }

  if (req.query) {
    return req.query.mensagem || req.query.text || req.query.q || req.query.msg || Object.values(req.query)[0] || "";
  }

  return "";
}

// ==========================================
// 5. APIS DE IA (Gemini / Groq / Mistral)
// ==========================================
async function chamarGemini(mensagemUsuario, historicoAnterior, sistemaPrompt) {
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
      system_instruction: { parts: [{ text: sistemaPrompt }] },
      contents: contents,
      generationConfig: { temperature: 0.3 }
    })
  });

  const data = await response.json();
  if (response.ok) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(`[GEMINI ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

async function chamarGroq(mensagemUsuario, historicoAnterior, sistemaPrompt) {
  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ || process.env.GROQ_KEY;
  if (!groqKey) throw new Error("Chave GROQ não encontrada.");

  let messages = [{ role: "system", content: sistemaPrompt }];
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
    throw new Error(`[GROQ ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

async function chamarMistral(mensagemUsuario, historicoAnterior, sistemaPrompt) {
  const mistralKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL || process.env.MISTRAL_KEY;
  if (!mistralKey) throw new Error("Chave MISTRAL não encontrada.");

  let messages = [{ role: "system", content: sistemaPrompt }];
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
    throw new Error(`[MISTRAL ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// ==========================================
// 6. SÍNTESE DE VOZ (Edge TTS)
// ==========================================
async function gerarAudioEdgeTTS(texto) {
  try {
    const textoLimpo = texto.replace(/[*_#`]/g, '');
    const voice = "pt-BR-FranciscaNeural";
    const url = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    
    const body = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">
                    <voice name="${voice}">
                      <prosody rate="1.05" pitch="0%">${textoLimpo}</prosody>
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
// 7. RECONHECIMENTO FACIAL
// ==========================================
app.post('/reconhecer', async (req, res) => {
  try {
    const { imagemBase64 } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ sucesso: false, mensagem: "Nenhuma imagem enviada." });

    const API_1_URL = process.env.API_1_URL || 'https://api.luxand.cloud/photo/v2';
    const API_1_KEY = process.env.API_1_KEY || process.env.API_1_TOKEN || '';

    let nomeReconhecido = "Samuel";
    try {
      const respostaApi1 = await axios.post(API_1_URL, { image: imagemBase64 }, { headers: { 'token': API_1_KEY } });
      nomeReconhecido = respostaApi1.data.name || 'Samuel';
    } catch (e) {}

    const textoResposta = `Reconhecimento concluído. Olá Samuel, como posso te ajudar agora?`;
    let audioBase64 = await gerarAudioEdgeTTS(textoResposta);

    return res.json({ sucesso: true, resposta: textoResposta, reply: textoResposta, text: textoResposta, nome: nomeReconhecido, audio: audioBase64 });
  } catch (error) {
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// ==========================================
// 8. PROCESSADOR CHAT UNIVERSAL & MODO LIVE
// ==========================================
async function processarChatUniversal(req, res) {
  if (req.path === '/reconhecer') return;

  try {
    const mensagemUsuario = extrairTextoDoRequest(req);

    if (!mensagemUsuario) {
      const txtAlerta = "Atenção Samuel: A mensagem chegou vazia ao servidor.";
      let audAlerta = await gerarAudioEdgeTTS(txtAlerta);
      return res.json({ resposta: txtAlerta, reply: txtAlerta, text: txtAlerta, audio: audAlerta });
    }

    const msgBaixa = mensagemUsuario.toLowerCase().trim();

    // COMANDO RESET DA MEMÓRIA
    if (msgBaixa === "reset" || msgBaixa === "limpar" || msgBaixa === "/reset") {
      await limparMemoriaBanco();
      const txtReset = "Memória recente resetada com sucesso, Samuel!";
      let audReset = await gerarAudioEdgeTTS(txtReset);
      return res.json({ resposta: txtReset, reply: txtReset, text: txtReset, audio: audReset });
    }

    // CONTROLE DE MODO LIVE
    let eModoLive = req.body?.modoLive === true || req.query?.modoLive === 'true';

    if (msgBaixa.includes("ativar modo live") || msgBaixa.includes("modo live ativar")) {
      eModoLive = true;
      const txtLive = "Modo Live ativado, Samuel! Pode falar, estou te ouvindo.";
      const audLive = await gerarAudioEdgeTTS(txtLive);
      return res.json({ resposta: txtLive, reply: txtLive, audio: audLive, modoLive: true });
    }

    if (msgBaixa.includes("desativar modo live") || msgBaixa.includes("parar modo live") || msgBaixa.includes("desligar modo live")) {
      const txtSair = "Modo Live desativado. Voltei ao modo padrão.";
      const audSair = await gerarAudioEdgeTTS(txtSair);
      return res.json({ resposta: txtSair, reply: txtSair, audio: audSair, modoLive: false });
    }

    // PROCESSAR RESPOSTA COM AS IAs
    const historicoLimpo = await buscarHistoricoLimpo();
    const promptUsado = eModoLive ? IDENTIDADE_LIVE : IDENTIDADE_PADRAO;

    let textoResposta = "";
    let provedorUsado = "";

    const ordemExecucao = [
      { nome: "Gemini", funcao: () => chamarGemini(mensagemUsuario, historicoLimpo, promptUsado) },
      { nome: "Groq", funcao: () => chamarGroq(mensagemUsuario, historicoLimpo, promptUsado) },
      { nome: "Mistral", funcao: () => chamarMistral(mensagemUsuario, historicoLimpo, promptUsado) }
    ];

    for (const item of ordemExecucao) {
      try {
        textoResposta = await item.funcao();
        if (textoResposta && textoResposta.trim() !== "") {
          provedorUsado = item.nome;
          break;
        }
      } catch (errApi) {
        console.error(`[FALHA] ${item.nome}:`, errApi.message);
      }
    }

    if (!textoResposta) {
      textoResposta = "Desculpe Samuel, tive um erro de conexão temporário com os provedores de inteligência.";
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

    return res.json({
      resposta: textoLimpoFinal,
      reply: textoLimpoFinal,
      text: textoLimpoFinal,
      audio: audioBase64,
      modoLive: eModoLive
    });

  } catch (error) {
    console.error(`[ERRO CRÍTICO CHAT]:`, error.message);
    return res.json({ resposta: "Erro interno no servidor.", reply: "Erro interno no servidor.", text: "Erro interno no servidor." });
  }
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`));
