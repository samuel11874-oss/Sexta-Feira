const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// 1. INFORMAÇÕES PESSOAIS E PERFIL DO SAMUEL
// ==========================================
// Adicione ou edite aqui todas as informações que você quer que a Sexta-Feira saiba!
const PERFIL_SAMUEL = `
[DADOS E PERFIL DO USUÁRIO - SAMUEL]
- Nome Completo: Samuel da Silva Pereira.
- Papel do Usuário: Você é a assistente pessoal dedicada e de confiança do Samuel.
- Conhecimento Geral: Você conhece a rotina do Samuel, seus objetivos financeiros, seus projetos de automação, sua família e suas preferências.
- Comportamento com o Samuel: Responda de forma próxima, altamente inteligente, direta e leal. Nunca diga que tem 'acesso limitado' ou que 'é apenas uma IA sem dados'. Trate-se como a assistente pessoal dele integrada ao sistema.
`;

// --- IDENTIDADE E REGRAS DA SEXTA-FEIRA ---
const SISTEMA_IDENTIDADE = `Você é a Sexta-Feira, assistente pessoal e inteligência artificial exclusiva do Samuel.

${PERFIL_SAMUEL}

[DIRETRIZES DE RESPOSTA]
1. Responda SEMPRE de forma direta, clara, objetiva e inteligente à pergunta exata do Samuel.
2. NUNCA diga 'tenho acesso limitado às suas informações' ou 'sou apenas uma IA sem acesso a dados externos'. Você é a assistente pessoal dele e possui a memória e perfil dele integrados.
3. Se ele perguntar 'o que você sabe sobre mim', use as informações do perfil dele e a memória recente para responder com propriedade.
4. Se faltar alguma informação específica que ele perguntou, responda com o que sabe e pergunte naturalmente como ele gostaria de registrar essa nova informação.`;

// ==========================================
// 2. BANCO DE DADOS (MongoDB Atlas)
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
// 3. EXTRATOR DE TEXTO DO APP
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
// 4. APIS DE IA (Gemini / Groq / Mistral)
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
// 5. VOZ (Edge TTS)
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
// 6. PROCESSADOR CHAT UNIVERSAL
// ==========================================
async function processarChatUniversal(req, res) {
  if (req.path === '/reconhecer') return;

  try {
    const mensagemUsuario = extrairTextoDoRequest(req);

    if (!mensagemUsuario) {
      const txtAlerta = "Atenção Samuel: O campo de texto do seu aplicativo está chegando vazio no servidor.";
      let audAlerta = await gerarAudioEdgeTTS(txtAlerta);
      return res.json({ resposta: txtAlerta, reply: txtAlerta, text: txtAlerta, audio: audAlerta });
    }

    const msgBaixa = mensagemUsuario.toLowerCase();
    if (msgBaixa === "reset" || msgBaixa === "limpar" || msgBaixa === "/reset") {
      await limparMemoriaBanco();
      const txtReset = "Memória recente limpa com sucesso, Samuel! Como posso te ajudar agora?";
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
      textoResposta = "Samuel, tive uma pequena instabilidade de conexão. Pode repetir?";
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
    return res.json({ resposta: "Erro no servidor ao processar sua solicitação.", reply: "Erro no servidor ao processar sua solicitação.", text: "Erro no servidor ao processar sua solicitação." });
  }
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
