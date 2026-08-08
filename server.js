const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

app.use(express.json());
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
    // Busca as últimas 5 mensagens salvas, ordenadas da mais antiga para a mais recente
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

// Funções de Comunicação com as IAs (com suporte a histórico)

async function chamarGeminiComHistorico(mensagemUsuario, historicoAnterior) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("A chave GEMINI_API_KEY não está configurada!");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

  // Monta o array de conteúdos incluindo o histórico anterior para dar contexto
  const contents = [];
  historicoAnterior.forEach(h => {
    if (h.usuario) contents.push({ role: "user", parts: [{ text: h.usuario }] });
    if (h.resposta) contents.push({ role: "model", parts: [{ text: h.resposta }] });
  });
  // Adiciona a mensagem atual
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

// Função Principal de Processamento do App
async function processarChatUniversal(req, res) {
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

    // Busca o histórico recente no MongoDB antes de chamar a IA
    const historicoRecente = await buscarHistoricoRecente();

    let textoResposta = "";
    let provedorUsado = "";

    // 1. TENTA GEMINI COM HISTÓRICO
    try {
      textoResposta = await chamarGeminiComHistorico(mensagemUsuario, historicoRecente);
      provedorUsado = "Gemini 3.5 Flash";
    } catch (errGemini) {
      console.log("Gemini indisponível, acionando Groq com histórico...", errGemini.message);
    }

    // 2. GROQ FALLBACK COM HISTÓRICO
    if (!textoResposta) {
      try {
        textoResposta = await chamarGroqComHistorico(mensagemUsuario, historicoRecente);
        provedorUsado = "Groq (Fallback)";
      } catch (errGroq) {
        console.log("Groq fallback falhou:", errGroq.message);
      }
    }

    // 3. EMERGÊNCIA ABSOLUTA
    if (!textoResposta) {
      textoResposta = "Olá Samuel! Tivemos uma instabilidade momentânea na conexão, mas já estou voltando ao normal.";
      provedorUsado = "Sistema (Emergência)";
    }

    // 4. GERA O ÁUDIO
    let audioBase64 = "";
    try {
      audioBase64 = await gerarAudioEdgeTTS(textoResposta);
    } catch (erroAudio) {
      console.log("Aviso ao processar áudio:", erroAudio.message);
    }

    // 5. SALVA NO BANCO DE DADOS
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

    // RETORNO FINAL PARA O APLICATIVO
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
