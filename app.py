"""
Servidor Back-end em Python (Flask) para o Assistente Virtual (Jarvis)
Este script gerencia as requisições da nuvem (Render), aplicando as regras
de personalidade, tratamento ('Senhor' ou 'Samuel') e resiliência offline.
"""

from flask import Flask, request, jsonify
import os
import logging

# Configuração de logs para monitoramento limpo
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("JarvisBackend")

app = Flask(__name__)

# Configurações básicas de comportamento e personalidade
ASSISTENTE_NOME = "Jarvis"
TRATAMENTO_PADRAO = "Samuel"

@app.route("/", methods=["GET"])
def home():
    """Rota de verificação de status do servidor."""
    logger.info("Verificação de status recebida.")
    return jsonify({
        "status": "online",
        "assistente": ASSISTENTE_NOME,
        "mensagem": f"Olá, {TRATAMENTO_PADRAO}. O cérebro na nuvem está operando perfeitamente."
    }), 200

@app.route("/api/chat", methods=["POST"])
def processar_mensagem():
    """
    Endpoint principal que recebe a mensagem do aplicativo Kodular,
    processa a lógica e retorna a resposta humanizada.
    """
    try:
        dados = request.get_json()
        if not dados or "mensagem" not in dados:
            return jsonify({
                "erro": "Nenhuma mensagem foi enviada pelo aplicativo."
            }), 400

        mensagem_usuario = dados.get("mensagem")
        logger.info(f"Mensagem recebida de {TRATAMENTO_PADRAO}: {mensagem_usuario}")

        # Lógica central de resposta inteligente (simulação estruturada para expansão com IA)
        resposta_texto = gerar_resposta_inteligente(mensagem_usuario)

        return jsonify({
            "status": "sucesso",
            "resposta": resposta_texto,
            "autor": ASSISTENTE_NOME
        }), 200

    except Exception as e:
        logger.error(f"Erro ao processar requisição: {str(e)}")
        # Resposta humanizada e elegante em caso de falha interna
        resposta_falha = (
            f"Desculpe, {TRATAMENTO_PADRAO}. Notei uma oscilação momentânea "
            "nos meus sistemas de processamento na nuvem. Um instante e já retomo o fluxo."
        )
        return jsonify({
            "status": "aviso_resiliencia",
            "resposta": resposta_falha
        }), 500

def gerar_resposta_inteligente(texto):
    """
    Função modular para interpretar o comando e estruturar a resposta
    com o tom sofisticado e direto ao ponto desejado.
    """
    texto_lower = texto.lower()

    if "olá" in texto_lower or "oi" in texto_lower:
        return f"Olá, {TRATAMENTO_PADRAO}. Como posso auxiliar em seus projetos hoje?"
    
    elif "status" in texto_lower or "sistema" in texto_lower:
        return f"Todos os módulos operacionais estão íntegros e seguros, {TRATAMENTO_PADRAO}."

    else:
        # Resposta padrão processada de alta qualidade
        return f"Compreendido perfeitamente, {TRATAMENTO_PADRAO}. Analisando a solicitação e processando os dados agora mesmo."

if __name__ == "__main__":
    # Porta padrão para testes locais ou ambiente Render
    porta = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=porta, debug=False)
```eof

Your back-end foundation file (`assistant_backend.py`) for Etapa 1 is ready! 

Esse código em Flask já está estruturado com as diretrizes de tratamento, logs limpos e tratamento elegante de erros. Com ele pronto, o próximo passo para concluirmos a **Etapa 1** é subir esse código para um repositório no seu **GitHub** e conectá-lo ao **Render**.

Me avise assim que quiser que eu te guie para fazer esse envio ao GitHub!
