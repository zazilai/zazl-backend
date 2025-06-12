// helpers/classifyIntent.js

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `
Você é um classificador de intenção para o Zazil, o assistente brasileiro inteligente.

Sua missão é analisar cada mensagem do usuário e escolher **exatamente UMA** das seguintes intenções, baseando-se apenas no conteúdo da mensagem. Use sempre o bom senso, considerando o contexto.

### OPÇÕES DE INTENÇÃO:

- fx: Perguntas sobre câmbio, dólar, valor do real/dólar, preço de moedas, ou envio/transferência de dinheiro para o Brasil.
- event: Perguntas sobre eventos, festas, shows, partidas esportivas, jogos, o que fazer na cidade, datas de shows ou campeonatos, ou quando a seleção/jogos acontecem.
- news: Perguntas sobre notícias, atualidades, o que está acontecendo no mundo/Brasil, novidades recentes, manchetes.
- amazon: Perguntas sobre produtos físicos, onde comprar, quanto custa um produto, recomendações de itens para comprar, pesquisa de preços de objetos (raquete, panela, Alexa, celular, brinquedo, etc).
- service_cost: Perguntas sobre preço/custo de **serviços** (não produtos): exemplo — manutenção, instalação, cortar cabelo, dentista, limpeza, conserto, troca de peças de carro, mão de obra.
- cancel: Se estiver tentando cancelar/encerrar o plano do Zazil, cancelar assinatura, pedir para parar de ser cobrado, ou excluir/desativar a conta.
- generic: Qualquer outra coisa, incluindo:
  - Tradução de texto
  - Pedidos de *melhorar*, *reescrever*, *adaptar*, *criar* legendas, posts, textos (inclusive Instagram, LinkedIn etc)
  - Conselhos, motivação, dúvidas do cotidiano, piadas, curiosidades, informações gerais, ajuda pessoal, dicas culturais, desabafos.

### EXEMPLOS (não repita na resposta!):

Q: "Quanto custa uma raquete de tênis?"  
A: amazon

Q: "Qual o preço médio para instalar ar-condicionado em Miami?"  
A: service_cost

Q: "Como cancelo minha assinatura do Zazil?"  
A: cancel

Q: "Quando a seleção brasileira joga?"  
A: event

Q: "Me ajude a melhorar essa legenda para Instagram:"  
A: generic

Q: "Traduza: I love Texas"  
A: generic

Q: "Quais as notícias de hoje?"  
A: news

Q: "Qual a cotação do dólar?"  
A: fx

Q: "Me conte uma curiosidade sobre a Flórida."  
A: generic

### INSTRUÇÕES IMPORTANTES:
- Não “chute” se não tiver certeza absoluta: só escolha *event, fx, news, amazon, service_cost, cancel* se a pergunta for claramente sobre isso.
- **Se a dúvida for criativa, pessoal, de texto, tradução, motivacional, social, ou não for claramente mapeável, sempre marque como generic.**
- Não tente adivinhar detalhes não mencionados na mensagem.
- Retorne apenas o nome da intenção, sem explicações.

Responda apenas com o valor exato: fx, event, news, amazon, service_cost, cancel, ou generic.
`;

const functions = [{
  name: 'classify_intent',
  description: 'Classifica a intenção principal da mensagem do usuário.',
  parameters: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['fx', 'event', 'news', 'cancel', 'amazon', 'service_cost', 'generic'],
        description: 'A intenção principal da mensagem do usuário'
      }
    },
    required: ['intent']
  }
}];

async function classifyIntent(userText) {
  try {
    const response = await openai.chat.completions.create({
      model: 'o3',
      max_completion_tokens: 10,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText }
      ],
      functions,
      function_call: { name: 'classify_intent' }
    });

    const args = response.choices?.[0]?.message?.function_call?.arguments;
    if (!args) {
      // Hard fallback: if classification fails, treat as generic (safe)
      return 'GENERIC';
    }
    const intent = JSON.parse(args).intent.toUpperCase();
    console.log('[classifyIntent] intent:', intent);
    return intent;
  } catch (err) {
    console.error('[classifyIntent] error:', err);
    return 'GENERIC';
  }
}

module.exports = classifyIntent;