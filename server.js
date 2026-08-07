const express = require('express');
// Tenta carregar o mongodb, se não conseguir, usamos uma variável nula para não quebrar o server
let MongoClient;
try { MongoClient = require('mongodb').MongoClient; } catch(e) { console.log("MongoDB não instalado."); }

const app = express();
app.use(express.json());

const SISTEMA_IDENTIDADE = "Você se chama Sexta-Feira. Você é a assistente pessoal inteligente e prestativa do Samuel.";

let dbColecao = null;

// Conexão segura ao MongoDB
async function conectarBanco() {
  if (!process.env.MONGO_URI || !MongoClient) return;
  try {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    dbColecao = client.db("sexta_feira_db").collection("memorias");
    console.log("Conectado ao MongoDB Atlas!");
  } catch (e) { console.error("Erro no MongoDB:", e.message); }
}
conectarBanco();

// Função de Processamento
async function processarChatUniversal(req, res) {
  const mensagemUsuario = req.body?.mensagem || req.body?.text || "Olá";
  
  // 1. IA (Gemini + Groq)
  let textoResposta = await chamarIA(mensagemUsuario);

  // 2. Voz Neural Google
  let audioBase64 = await gerarAudioGoogleTTS(textoResposta);

  // 3. Salvar no Mongo (se estiver ativo)
  if (dbColecao) {
    dbColecao.insertOne({ data: new Date(), usuario: mensagemUsuario, resposta: textoResposta }).catch(() => {});
  }

  res.json({ resposta: textoResposta, audio: audioBase64 });
}

// Funções de apoio (Gemini, Groq, TTS) - Mantenha as que você já tem no código anterior...

app.all('*', processarChatUniversal);
app.listen(10000);
