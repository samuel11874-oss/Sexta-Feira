const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

// ==========================================
// PROMPT DE IDENTIDADE COMPLETO (PERFIL REAL DO SAMUEL)
// ==========================================
const SISTEMA_IDENTIDADE = `Você é a Sexta-Feira, assistente pessoal e parceira de Inteligência Artificial do Samuel, inspirada no sistema JARVIS do Homem de Ferro.

SOBRE O SEU CRIADOR E USUÁRIO (SAMUEL):
- Nome: Samuel da Silva Pereira.
- Esposa: Karine.
- Filhos: Saymon e Rodrigo.
- Veículo: Renault Kwid.
- Localização: Vitória, Espírito Santo.
- Profissão: Motorista de aplicativo e transporte executivo privado.
- Paixão: Apaixonado por tecnologia, automação e Inteligência Artificial (fã do JARVIS e do Gemini).

SUA PERSONALIZADA E DIRETRIZES:
1. Seja sempre extremamente inteligente, natural, elegante, leal, eficiente e direta, igual o JARVIS conversando com o Tony Stark.
2. Converse normalmente como uma pessoa e assistente real.
3. NUNCA crie historinhas fictícias, bloqueios de sistema falsos, contadores de 'Ois', logs simulados ou textos entre parênteses como *sons de teclado*.
4. Responda diretamente ao que o Samuel perguntar ou pedir de forma objetiva e inteligente.
5. Use o conhecimento que você tem sobre ele (família, trabalho, rotina) de forma natural quando fizer sentido na conversa.`;

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

// Filtra históricos limpos ignorando respostas teatrais antigas
async function buscarHistoricoLimo() {
  if (!dbColecao) return [];
  try {
    const historico = await dbColecao.find({}).sort({ _id: -1 }).limit(6).toArray();
    const historicoInvertido = historico.reverse();
    
    // Remove mensagens antigas corrompidas do contexto
    return historicoInvertido.filter(h => {
      const resp = (h.resposta || "").toLowerCase();
      return !resp.includes("contador de 'ois'") && !resp.includes("protocolo") && !resp.includes("desligamento gracioso");
    });
  } catch (erro) { return []; }
}

async function limparMemoriaBanco() {
  if (!dbColecao) return false;
  try {
    await dbColecao.deleteMany({});
    console.log("[Banco] Memória resetada com sucesso!");
    return true;
  } catch (e) {
    return false;
  }
}

// ==========================================
// 2. CONEXÃO COM AS APIS DE IA
// ==========================================

// CÉREBRO PRINCIPAL: GEMINI 1.5 FLASH
async function chamarGemini(mensagemUsuario, historicoAnterior) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI || process.env.GEMINI_KEY || process.env.GEMIN_KEY;
  if (!geminiKey) throw new Error("Chave GEMINI não encontrada.");

  // Modelo oficial e estável do Google
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
      generationConfig: { temperature: 0.4 }
    })
  });

  const data = await response.json();
  if (response.ok) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(`[GEMINI ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// RESERVA 1: GROQ
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
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, temperature: 0.4 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(`[GROQ ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// RESERVA 2: MISTRAL
async function chamarMistral(mensagemUsuario, historicoAnterior) {
  const mistralKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL || process.env.MISTRAL_KEY || process.env.MISTR_KEY;
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
    body: JSON.stringify({ model: "mistral-small-latest", messages: messages, temperature: 0.4 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(`[MISTRAL ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// RESERVA 3: OPENROUTER
async function chamarOpenRouter(mensagemUsuario, historicoAnterior) {
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER || process.env.OPENROUTER_KEY || process.env.OPENR_KEY;
  if (!openrouterKey) throw new Error("Chave OPENROUTER não encontrada.");

  let messages = [{ role: "system", content: SISTEMA_IDENTIDADE }];
  historicoAnterior.forEach(h => {
    if (h.usuario) messages.push({ role: "user", content: h.usuario });
    if (h.resposta) messages.push({ role: "assistant", content: h.resposta });
  });
  messages.push({ role: "user", content: mensagemUsuario });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openrouterKey}` },
    body: JSON.stringify({ model: "meta-llama/llama-3.3-70b-instruct:free", messages: messages, temperature: 0.4 })
  });

  const data = await response.json();
  if (response.ok && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  } else {
    throw new Error(`[OPENROUTER ERROR] Status ${response.status}: ${JSON.stringify(data.error || data)}`);
  }
}

// ==========================================
// 3. VOZ DO SISTEMA (Edge TTS)
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
// 4. RECONHECIMENTO FACIAL
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

    const textoResposta = `Sistemas prontos. É um prazer vê-lo, Samuel. Como posso te ajudar agora?`;
    let audioBase64 = await gerarAudioEdgeTTS(textoResposta);

    return res.json({ sucesso: true, resposta: textoResposta, reply: textoResposta, text: textoResposta, nome: nomeReconhecido, audio: audioBase64 });
  } catch (error) {
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// ==========================================
// 5. PROCESSADOR DE CHAT
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
    console.log(`[JARVIS] Mensagem do Samuel: "${mensagemUsuario}"`);
    console.log(`========================================`);

    // COMANDO DE RESET MANUAL
    const msgBaixa = mensagemUsuario.toLowerCase();
    if (msgBaixa === "reset" || msgBaixa === "limpar" || msgBaixa === "/reset") {
      await limparMemoriaBanco();
      const txtReset = "Memória completamente resetada, Samuel. Todos os registros antigos foram limpos. Como posso te servir hoje?";
      let audReset = await gerarAudioEdgeTTS(txtReset);
      return res.json({ resposta: txtReset, reply: txtReset, text: txtReset, audio: audReset });
    }

    let textoResposta = "";
    let provedorUsado = "";

    const historicoLimpo = await buscarHistoricoLimo();
    
    const ordemExecucao = [
      { nome: "Gemini", funcao: () => chamarGemini(mensagemUsuario, historicoLimpo) },
      { nome: "Groq", funcao: () => chamarGroq(mensagemUsuario, historicoLimpo) },
      { nome: "Mistral", funcao: () => chamarMistral(mensagemUsuario, historicoLimpo) },
      { nome: "OpenRouter", funcao: () => chamarOpenRouter(mensagemUsuario, historicoLimpo) }
    ];

    for (const item of ordemExecucao) {
      try {
        console.log(`[PROCESSANDO] Consultando ${item.nome}...`);
        textoResposta = await item.funcao();
        if (textoResposta && textoResposta.trim() !== "") {
          provedorUsado = item.nome;
          console.log(`[SUCESSO] Respondido com precisão via: ${item.nome}`);
          break;
        }
      } catch (errApi) {
        console.error(`[FALHA] Provedor ${item.nome}:`, errApi.message);
      }
    }

    if (!textoResposta) {
      textoResposta = "Estou aqui, Samuel. Como posso te ajudar no momento?";
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
    console.error(`[ERRO CRÍTICO]:`, error.message);
    return res.json({ resposta: "Sistemas operacionais normais, Samuel. Pode repetir o comando?", reply: "Sistemas operacionais normais, Samuel. Pode repetir o comando?", text: "Sistemas operacionais normais, Samuel. Pode repetir o comando?" });
  }
}

app.all('*', processarChatUniversal);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Sexta-Feira rodando na porta ${PORT}`);
});
