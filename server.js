const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

// ==========================================
// 1. CONFIGURAÇÃO DE CORS (LIBERAÇÃO TOTAL)
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

app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rota simples de teste de vida do servidor
app.get('/', (req, res) => {
  res.json({ status: "online", mensagem: "Servidor da Sexta-Feira rodando perfeitamente!" });
});

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
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    dbColecao = client.db("sexta_feira_db").collection("memorias");
    console.log("[Banco] Conectado ao MongoDB Atlas!");
  } catch (erro) {
    console.error("[ERRO BANCO]:", erro.message);
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
// 5. APIS DE IA (Gemini / Groq / Mistral via Axios)
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

  const res = await axios.post(geminiUrl, {
    system_instruction: { parts: [{ text: sistemaPrompt }] },
    contents: contents,
    generationConfig: { temperature: 0.3 }
  }, { timeout: 12000 });

  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
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

  const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
    model: "llama-3.3-70b-versatile",
    messages: messages,
    temperature: 0.3
  }, {
    headers: { "Authorization": `Bearer ${groqKey}` },
    timeout: 12000
  });

  return res.data?.choices?.[0]?.message?.content || "";
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

  const res = await axios.post("https://api.mistral.ai/v1/chat/completions", {
    model: "mistral-small-latest",
    messages: messages,
    temperature: 0.3
  }, {
    headers: { "Authorization": `Bearer ${mistralKey}` },
    timeout: 12000
  });

  return res.data?.choices?.[0]?.message?.content || "";
}

// ==========================================
// 6. SÍNTESE DE VOZ CORRIGIDA (Edge TTS)
// ==========================================
async function gerarAudioEdgeTTS(texto) {
  try {
    const textoLimpo = texto.replace(/[*_#`]/g, '').trim();
    if (!textoLimpo) return "";

    const voice = "pt-BR-FranciscaNeural";
    const url = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    
    const body = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">
                    <voice name="${voice}">
                      <prosody rate="1.0" pitch="0%">${textoLimpo}</prosody>
                    </voice>
                  </speak>`;

    const res = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
      },
      responseType: "arraybuffer",
      timeout: 10000
    });

    return Buffer.from(res.data).toString("base64");
  } catch (erro) {
    console.error("[ERRO VOZ EDGE TTS]:", erro.message);
    return "";
  }
}

// ==========================================
// 7. PROCESSADOR DE CHAT
// ==========================================
async function processarChatUniversal(req, res) {
  try {
    const mensagemUsuario = extrairTextoDoRequest(req);

    if (!mensagemUsuario) {
      const txtAlerta = "Atenção Samuel: A mensagem chegou vazia ao servidor.";
      let audAlerta = await gerarAudioEdgeTTS(txtAlerta);
      return res.json({ resposta: txtAlerta, reply: txtAlerta, text: txtAlerta, audio: audAlerta });
    }

    const msgBaixa = mensagemUsuario.toLowerCase().trim();

    if (msgBaixa === "reset" || msgBaixa === "limpar" || msgBaixa === "/reset") {
      await limparMemoriaBanco();
      const txtReset = "Memória recente resetada com sucesso, Samuel!";
      let audReset = await gerarAudioEdgeTTS(txtReset);
      return res.json({ resposta: txtReset, reply: txtReset, text: txtReset, audio: audReset });
    }

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
        console.error(`[FALHA PROVEDOR ${item.nome}]:`, errApi.message);
      }
    }

    if (!textoResposta) {
      textoResposta = "Desculpe Samuel, tive um problema de conexão com as IAs. Tente novamente em alguns segundos.";
      provedorUsado = "Sistema-Local";
    }

    let textoLimpoFinal = textoResposta.replace(/[*_#`]/g, '');
    let audioBase64 = await gerarAudioEdgeTTS(textoLimpoFinal);

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
