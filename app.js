const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const winston = require("winston");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const { chromium } = require("playwright");
const cloudscraper = require("cloudscraper");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const UAParser = require("ua-parser-js");
const MobileDetect = require("mobile-detect");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de logs aprimorada
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: "chatbot_v6.log" })
  ]
});

// Middlewares aprimorados
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Servir arquivos estáticos
app.use(express.static(__dirname));

// Cache aprimorado para dados extraídos
const dataCache = new Map();
const CACHE_TTL = 3600000; // 1 hora

// Cache para conversas do chatbot com TTL
const conversationCache = new Map();
const CONVERSATION_TTL = 7200000; // 2 horas

// Cache para análise de intenção
const intentCache = new Map();

// 🔒 NOVO: Cache para instruções personalizadas (CORREÇÃO PRINCIPAL)
const instructionsCache = new Map();
const INSTRUCTIONS_TTL = 86400000; // 24 horas

// Função SUPER AVANÇADA para extração universal de dados
class UniversalWebExtractor {
  constructor() {
    this.userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0"
    ];
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async detectBestMethod(url) {
    const domain = new URL(url).hostname.toLowerCase();
    
    // Sites que requerem JavaScript avançado
    const jsHeavySites = [
      "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
      "tiktok.com", "youtube.com", "pinterest.com", "snapchat.com"
    ];
    
    // Sites com proteção Cloudflare
    const cloudflareSites = [
      "shopify.com", "wordpress.com", "wix.com", "squarespace.com"
    ];
    
    // Sites conhecidos por bloquearem bots
    const botBlockingSites = [
      "amazon.com", "ebay.com", "mercadolivre.com", "aliexpress.com",
      "booking.com", "airbnb.com"
    ];

    if (jsHeavySites.some(site => domain.includes(site))) {
      return "playwright";
    }
    
    if (cloudflareSites.some(site => domain.includes(site))) {
      return "cloudscraper";
    }
    
    if (botBlockingSites.some(site => domain.includes(site))) {
      return "puppeteer";
    }
    
    // Padrão para sites simples
    return "axios";
  }

  async extractWithAxios(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": this.getRandomUserAgent(),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none"
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: status => status >= 200 && status < 400
      });

      return { success: true, html: response.data, finalUrl: response.request.res?.responseUrl || url };
    } catch (error) {
      logger.warn(`Axios extraction failed for ${url}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async extractWithCloudscraper(url) {
    try {
      const response = await cloudscraper.get({
        uri: url,
        headers: {
          "User-Agent": this.getRandomUserAgent()
        },
        timeout: 20000
      });

      return { success: true, html: response, finalUrl: url };
    } catch (error) {
      logger.warn(`Cloudscraper extraction failed for ${url}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async extractWithPuppeteer(url) {
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu"
        ]
      });

      const page = await browser.newPage();
      
      await page.setUserAgent(this.getRandomUserAgent());
      await page.setViewport({ width: 1366, height: 768 });
      
      // Interceptar e bloquear recursos desnecessários para acelerar
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const resourceType = req.resourceType();
        if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(url, { 
        waitUntil: "domcontentloaded", 
        timeout: 30000 
      });

      // Aguardar um pouco para JavaScript carregar
      await page.waitForTimeout(2000);

      const html = await page.content();
      const finalUrl = page.url();

      return { success: true, html, finalUrl };
    } catch (error) {
      logger.warn(`Puppeteer extraction failed for ${url}:`, error.message);
      return { success: false, error: error.message };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async extractWithPlaywright(url) {
    let browser = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage"
        ]
      });

      const context = await browser.newContext({
        userAgent: this.getRandomUserAgent(),
        viewport: { width: 1366, height: 768 }
      });

      const page = await context.newPage();

      // Bloquear recursos desnecessários
      await page.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      await page.goto(url, { 
        waitUntil: "domcontentloaded", 
        timeout: 30000 
      });

      // Aguardar JavaScript carregar
      await page.waitForTimeout(3000);

      const html = await page.content();
      const finalUrl = page.url();

      return { success: true, html, finalUrl };
    } catch (error) {
      logger.warn(`Playwright extraction failed for ${url}:`, error.message);
      return { success: false, error: error.message };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async extractData(url, method = "auto") {
    try {
      logger.info(`Iniciando extração UNIVERSAL para: ${url}`);
      
      // Verificar cache
      const cacheKey = `${url}_${method}`;
      const cached = dataCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.info("Dados encontrados no cache");
        return cached.data;
      }

      // Detectar melhor método se auto
      if (method === "auto") {
        method = await this.detectBestMethod(url);
      }

      logger.info(`Usando método: ${method}`);

      let extractionResult;
      switch (method) {
        case "cloudscraper":
          extractionResult = await this.extractWithCloudscraper(url);
          break;
        case "puppeteer":
          extractionResult = await this.extractWithPuppeteer(url);
          break;
        case "playwright":
          extractionResult = await this.extractWithPlaywright(url);
          break;
        default:
          extractionResult = await this.extractWithAxios(url);
      }

      if (!extractionResult.success) {
        // Fallback: tentar outros métodos
        const fallbackMethods = ["axios", "cloudscraper", "puppeteer", "playwright"]
          .filter(m => m !== method);
        
        for (const fallbackMethod of fallbackMethods) {
          logger.info(`Tentando fallback com: ${fallbackMethod}`);
          
          switch (fallbackMethod) {
            case "cloudscraper":
              extractionResult = await this.extractWithCloudscraper(url);
              break;
            case "puppeteer":
              extractionResult = await this.extractWithPuppeteer(url);
              break;
            case "playwright":
              extractionResult = await this.extractWithPlaywright(url);
              break;
            default:
              extractionResult = await this.extractWithAxios(url);
          }

          if (extractionResult.success) {
            method = fallbackMethod;
            break;
          }
        }
      }

      if (!extractionResult.success) {
        throw new Error("Todos os métodos de extração falharam");
      }

      // Processar HTML extraído
      const processedData = this.processExtractedHTML(extractionResult.html, extractionResult.finalUrl);
      processedData.extractionMethod = method;

      // Salvar no cache
      dataCache.set(cacheKey, {
        data: processedData,
        timestamp: Date.now()
      });

      logger.info("Extração UNIVERSAL concluída com sucesso");
      return processedData;

    } catch (error) {
      logger.error("Erro na extração universal:", error);
      
      // Retornar dados padrão em caso de erro total
      return this.getDefaultData(url);
    }
  }

  processExtractedHTML(html, finalUrl) {
    const $ = cheerio.load(html);
    
    const extractedData = {
      url: finalUrl,
      title: "",
      description: "",
      price: "",
      benefits: [],
      testimonials: [],
      cta: "",
      images: [],
      videos: [],
      contact: {},
      metadata: {}
    };

    // Extrair título com múltiplas estratégias
    const titleSelectors = [
      "h1:not(:contains(\"404\")):not(:contains(\"Error\")):not(:contains(\"Página não encontrada\"))",
      ".main-title, .product-title, .headline, .title",
      "[class*=\"title\"]:not(:contains(\"Error\"))",
      "meta[property=\"og:title\"]",
      "meta[name=\"twitter:title\"]",
      "title"
    ];
    
    for (const selector of titleSelectors) {
      const element = $(selector).first();
      if (element.length) {
        const title = element.attr("content") || element.text();
        if (title && title.trim().length > 5 && !title.toLowerCase().includes("error")) {
          extractedData.title = title.trim();
          break;
        }
      }
    }

    // Extrair descrição mais específica
    const descSelectors = [
      ".product-description p:first-child",
      ".description p:first-child",
      ".summary, .lead, .intro",
      "meta[name=\"description\"]",
      "meta[property=\"og:description\"]",
      "p:not(:contains(\"cookie\")):not(:contains(\"política\")):not(:empty)"
    ];
    
    for (const selector of descSelectors) {
      const element = $(selector).first();
      if (element.length) {
        const description = element.attr("content") || element.text();
        if (description && description.trim().length > 50) {
          extractedData.description = description.trim().substring(0, 500);
          break;
        }
      }
    }

    // Extrair preços com regex mais avançada
    const priceSelectors = [
      ".price, .valor, .preco, .cost, .amount",
      "[class*=\"price\"], [class*=\"valor\"], [class*=\"preco\"]"
    ];
    
    for (const selector of priceSelectors) {
      $(selector).each((i, element) => {
        const text = $(element).text().trim();
        const priceMatch = text.match(/R\\$\s*\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?|USD\\s*\\d+[.,]?\\d*|\\$\s*\\d+[.,]?\\d*/);
        if (priceMatch && !extractedData.price) {
          extractedData.price = priceMatch[0];
          return false;
        }
      });
      if (extractedData.price) break;
    }

    // Extrair benefícios
    const benefitSelectors = [
      ".benefits li, .vantagens li, .features li",
      "ul li:contains(\"✓\"), ul li:contains(\"✅\")",
      "li:contains(\"Transforme\"), li:contains(\"Alcance\"), li:contains(\"Aprenda\")"
    ];
    
    for (const selector of benefitSelectors) {
      $(selector).each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10 && text.length < 200 && extractedData.benefits.length < 8) {
          if (!extractedData.benefits.includes(text)) {
            extractedData.benefits.push(text);
          }
        }
      });
      if (extractedData.benefits.length >= 8) break;
    }

    // Extrair depoimentos
    const testimonialSelectors = [
      ".testimonials, .depoimentos, .reviews",
      "*:contains(\"recomendo\"), *:contains(\"excelente\"), *:contains(\"funcionou\")"
    ];
    
    for (const selector of testimonialSelectors) {
      $(selector).each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 20 && text.length < 300 && extractedData.testimonials.length < 5) {
          if (!extractedData.testimonials.includes(text)) {
            extractedData.testimonials.push(text);
          }
        }
      });
      if (extractedData.testimonials.length >= 5) break;
    }

    // Extrair CTA
    const ctaSelectors = [
      "a:contains(\"COMPRAR\"), button:contains(\"COMPRAR\")",
      "a:contains(\"QUERO\"), button:contains(\"QUERO\")",
      ".buy-button, .call-to-action, .btn-primary"
    ];
    
    for (const selector of ctaSelectors) {
      const element = $(selector).first();
      if (element.length) {
        const cta = element.text().trim();
        if (cta && cta.length > 3 && cta.length < 100) {
          extractedData.cta = cta;
          break;
        }
      }
    }

    // Extrair imagens
    $("img").each((i, img) => {
      const src = $(img).attr("src");
      const alt = $(img).attr("alt") || "";
      if (src && !src.includes("data:") && extractedData.images.length < 10) {
        extractedData.images.push({
          src: src.startsWith("http") ? src : new URL(src, finalUrl).href,
          alt: alt
        });
      }
    });

    // Extrair vídeos
    $("video, iframe[src*=\"youtube\"], iframe[src*=\"vimeo\"]").each((i, video) => {
      const src = $(video).attr("src") || $(video).find("source").attr("src");
      if (src && extractedData.videos.length < 5) {
        extractedData.videos.push(src);
      }
    });

    // Extrair informações de contato
    const emailMatch = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      extractedData.contact.email = emailMatch[0];
    }

    const phoneMatch = html.match(/\\(\\d{2}\\)\\s*\\d{4,5}-?\\d{4}|\\d{2}\\s*\\d{4,5}-?\\d{4}/);
    if (phoneMatch) {
      extractedData.contact.phone = phoneMatch[0];
    }

    // Extrair metadados
    extractedData.metadata = {
      ogTitle: $("meta[property=\"og:title\"]").attr("content") || "",
      ogDescription: $("meta[property=\"og:description\"]").attr("content") || "",
      ogImage: $("meta[property=\"og:image\"]").attr("content") || "",
      keywords: $("meta[name=\"keywords\"]").attr("content") || "",
      author: $("meta[name=\"author\"]").attr("content") || ""
    };

    return extractedData;
  }

  getDefaultData(url) {
    return {
      url: url,
      title: "Produto ou Serviço Incrível",
      description: "Descubra uma solução inovadora que vai transformar sua vida. Aproveite esta oportunidade única!",
      price: "Consulte o preço",
      benefits: [
        "Resultados comprovados",
        "Fácil de usar",
        "Suporte especializado",
        "Garantia de satisfação"
      ],
      testimonials: [
        "Produto excelente, recomendo!",
        "Mudou minha vida para melhor",
        "Atendimento nota 10"
      ],
      cta: "QUERO COMPRAR AGORA",
      images: [],
      videos: [],
      contact: {},
      metadata: {},
      extractionMethod: "default"
    };
  }
}

// Instanciar o extrator
const webExtractor = new UniversalWebExtractor();

// 🔒 NOVA FUNÇÃO: Gerar ID único para instruções
function generateInstructionsId() {
  return "inst_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// 🔒 NOVA FUNÇÃO: Armazenar instruções de forma segura
function storeInstructions(instructions) {
  const id = generateInstructionsId();
  instructionsCache.set(id, {
    instructions: instructions,
    timestamp: Date.now()
  });
  
  // Limpar instruções expiradas
  for (const [key, value] of instructionsCache.entries()) {
    if (Date.now() - value.timestamp > INSTRUCTIONS_TTL) {
      instructionsCache.delete(key);
    }
  }
  
  logger.info(`Instruções armazenadas com ID: ${id}`);
  return id;
}

// 🔒 NOVA FUNÇÃO: Recuperar instruções por ID
function getInstructionsById(id) {
  const cached = instructionsCache.get(id);
  if (cached && Date.now() - cached.timestamp < INSTRUCTIONS_TTL) {
    return cached.instructions;
  }
  return null;
}

// 🔒 NOVA FUNÇÃO: Aplicar instruções personalizadas ao prompt
function applyCustomInstructions(basePrompt, customInstructions) {
  if (!customInstructions) {
    return basePrompt;
  }
  
  return `${customInstructions}\n\n${basePrompt}`;
}

// Função para análise de intenção avançada
async function analyzeUserIntent(message, pageData) {
  const cacheKey = `intent_${message.toLowerCase().substring(0, 50)}`;
  const cached = intentCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Análise de intenção baseada em palavras-chave e contexto
  const intent = {
    type: "general",
    confidence: 0.5,
    keywords: [],
    suggestedResponse: "general"
  };

  const messageLower = message.toLowerCase();
  
  // Intenções de compra
  const buyKeywords = ["comprar", "preço", "valor", "quanto custa", "adquirir", "pagar", "pagamento"];
  if (buyKeywords.some(keyword => messageLower.includes(keyword))) {
    intent.type = "purchase";
    intent.confidence = 0.9;
    intent.suggestedResponse = "purchase";
  }
  
  // Intenções de dúvida
  const doubtKeywords = ["como", "funciona", "dúvida", "pergunta", "explicar", "entender"];
  if (doubtKeywords.some(keyword => messageLower.includes(keyword))) {
    intent.type = "question";
    intent.confidence = 0.8;
    intent.suggestedResponse = "explanation";
  }
  
  // Intenções de benefícios
  const benefitKeywords = ["benefício", "vantagem", "resultado", "ajuda", "melhora"];
  if (benefitKeywords.some(keyword => messageLower.includes(keyword))) {
    intent.type = "benefits";
    intent.confidence = 0.8;
    intent.suggestedResponse = "benefits";
  }

  intentCache.set(cacheKey, {
    data: intent,
    timestamp: Date.now()
  });

  return intent;
}

// Função para gerar resposta contextual avançada
async function generateContextualResponse(message, pageData, conversationHistory = [], customInstructions = null) {
  try {
    const intent = await analyzeUserIntent(message, pageData);
    
    // Construir contexto da conversa
    const conversationContext = conversationHistory
      .slice(-5) // Últimas 5 mensagens
      .map(msg => `${msg.role}: ${msg.content}`)
      .join("\n");

    // Prompt base contextual
    let basePrompt = `Você é ${pageData.robotName || "um assistente virtual especializado"} e está ajudando um cliente interessado no seguinte produto/serviço:\n\nINFORMAÇÕES DO PRODUTO:\n- Título: ${pageData.title}\n- Descrição: ${pageData.description}\n- Preço: ${pageData.price}\n- Benefícios principais: ${pageData.benefits.slice(0, 5).join(", ")}\n- Call-to-Action: ${pageData.cta}\n\nCONTEXTO DA CONVERSA:\n${conversationContext}\n\nMENSAGEM ATUAL DO CLIENTE: ${message}\n\nINSTRUÇÕES:\n- Seja natural, amigável e persuasivo\n- Use as informações do produto para responder\n- Mantenha o foco na conversão\n- Se não souber algo específico, seja honesto\n- Incentive o cliente a tomar ação\n- Use emojis moderadamente para tornar a conversa mais amigável\n- Responda em português brasileiro`;

    // 🔒 APLICAR INSTRUÇÕES PERSONALIZADAS (se fornecidas)
    if (customInstructions) {
      basePrompt = applyCustomInstructions(basePrompt, customInstructions);
    }

    // Personalizar resposta baseada na intenção
    switch (intent.type) {
      case "purchase":
        basePrompt += `\n\nO cliente demonstrou interesse em comprar. Foque em facilitar a compra, mencione o preço (${pageData.price}) e incentive a ação imediata.`;
        break;
      case "question":
        basePrompt += `\n\nO cliente tem dúvidas. Seja didático e explicativo, use as informações do produto para esclarecer.`;
        break;
      case "benefits":
        basePrompt += `\n\nO cliente quer saber sobre benefícios. Destaque os principais benefícios: ${pageData.benefits.slice(0, 3).join(", ")}.`;
        break;
    }

    // Simular resposta da IA (aqui você integraria com OpenAI, Claude, etc.)
    const response = await generateAIResponse(basePrompt, message, pageData, intent);
    
    return {
      success: true,
      response: response,
      intent: intent.type,
      confidence: intent.confidence
    };

  } catch (error) {
    logger.error("Erro ao gerar resposta contextual:", error);
    
    // Resposta de fallback
    return {
      success: true,
      response: `Olá! Sou ${pageData.robotName || "seu assistente virtual"} e estou aqui para ajudar você com ${pageData.title}. Como posso te ajudar hoje? 😊`,
      intent: "general",
      confidence: 0.5
    };
  }
}

// Função para gerar resposta da IA (integração com APIs de IA)
async function generateAIResponse(prompt, userMessage, pageData, intent) {
  try {
    // Aqui você pode integrar com OpenAI, Claude, ou outra API de IA
    // Por enquanto, vamos usar respostas inteligentes baseadas em templates
    
    const templates = {
      purchase: [
        `Que ótimo que você tem interesse em ${pageData.title}! 🎉 O investimento é de ${pageData.price} e você terá acesso a todos esses benefícios: ${pageData.benefits.slice(0, 3).join(", ")}. ${pageData.cta}! Posso te ajudar com mais alguma informação?`,
        `Perfeito! ${pageData.title} é realmente uma excelente escolha. Por ${pageData.price}, você garante ${pageData.benefits[0] || "resultados incríveis"}. Que tal garantir o seu agora? ${pageData.cta}! 🚀`
      ],
      question: [
        `Claro! Vou te explicar sobre ${pageData.title}. ${pageData.description} Os principais benefícios são: ${pageData.benefits.slice(0, 3).join(", ")}. Tem alguma dúvida específica que posso esclarecer?`,
        `Ótima pergunta! ${pageData.title} funciona de forma simples e eficaz. ${pageData.description} E o melhor: ${pageData.benefits[0] || "você terá resultados garantidos"}. O que mais gostaria de saber? 🤔`
      ],
      benefits: [
        `Os benefícios de ${pageData.title} são realmente impressionantes! ✨ Você terá: ${pageData.benefits.slice(0, 4).join(", ")}. Por apenas ${pageData.price}, vale muito a pena! ${pageData.cta}!`,
        `Excelente pergunta! Com ${pageData.title} você consegue: ${pageData.benefits.slice(0, 3).join(", ")}. São resultados comprovados por ${pageData.price}. Que tal garantir o seu? 🎯`
      ],
      general: [
        `Olá! Sou especialista em ${pageData.title} e estou aqui para te ajudar! 😊 ${pageData.description} Como posso te ajudar hoje?`,
        `Oi! Que bom ter você aqui! ${pageData.title} é realmente incrível: ${pageData.benefits[0] || "resultados garantidos"}. Em que posso te ajudar? 🤝`
      ]
    };

    const responseTemplates = templates[intent.type] || templates.general;
    const randomTemplate = responseTemplates[Math.floor(Math.random() * responseTemplates.length)];
    
    return randomTemplate;

  } catch (error) {
    logger.error("Erro na geração de resposta da IA:", error);
    return `Olá! Sou ${pageData.robotName || "seu assistente virtual"} e estou aqui para ajudar com ${pageData.title}. Como posso te ajudar? 😊`;
  }
}

// Função para detectar dispositivo e plataforma
function detectDeviceAndPlatform(userAgent) {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  const md = new MobileDetect(userAgent);

  return {
    device: {
      type: md.mobile() ? "mobile" : md.tablet() ? "tablet" : "desktop",
      model: result.device.model || "unknown",
      vendor: result.device.vendor || "unknown"
    },
    os: {
      name: result.os.name || "unknown",
      version: result.os.version || "unknown"
    },
    browser: {
      name: result.browser.name || "unknown",
      version: result.browser.version || "unknown"
    },
    isMobile: !!md.mobile(),
    isTablet: !!md.tablet(),
    isDesktop: !md.mobile() && !md.tablet()
  };
}

// Função para gerar deep links multiplataforma
function generateDeepLinks(chatbotUrl, platform, deviceInfo) {
  const encodedContent = encodeURIComponent(chatbotUrl);
  
  const links = {
    whatsapp: {
      mobile: `whatsapp://send?text=${encodedContent}`,
      web: `https://wa.me/?text=${encodedContent}`
    },
    instagram: {
      mobile: `instagram://`,
      web: `https://www.instagram.com/`
    },
    facebook: {
      mobile: `fb://`,
      web: `https://www.facebook.com/sharer/sharer.php?u=${encodedContent}`
    },
    twitter: {
      mobile: `twitter://post?message=${encodedContent}`,
      web: `https://twitter.com/intent/tweet?text=${encodedContent}`
    },
    linkedin: {
      mobile: `linkedin://`,
      web: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedContent}`
    },
    telegram: {
      mobile: `tg://msg?text=${encodedContent}`,
      web: `https://t.me/share/url?text=${encodedContent}`
    },
    youtube: {
      mobile: `youtube://`,
      web: `https://www.youtube.com/`
    },
    tiktok: {
      mobile: `tiktok://`,
      web: `https://www.tiktok.com/`
    }
  };

  const platformLinks = links[platform];
  if (!platformLinks) {
    return { mobile: "", web: "" };
  }

  return {
    mobile: platformLinks.mobile,
    web: platformLinks.web,
    preferred: deviceInfo.isMobile ? platformLinks.mobile : platformLinks.web
  };
}

// ROTAS DA API

// 🔒 NOVA ROTA: Armazenar instruções personalizadas de forma segura
app.post("/store-instructions", (req, res) => {
  try {
    const { instructions } = req.body;
    
    if (!instructions || typeof instructions !== "string") {
      return res.status(400).json({
        success: false,
        error: "Instruções são obrigatórias e devem ser uma string"
      });
    }
    
    const instructionsId = storeInstructions(instructions.trim());
    
    res.json({
      success: true,
      id: instructionsId,
      message: "Instruções armazenadas com sucesso"
    });
    
  } catch (error) {
    logger.error("Erro ao armazenar instruções:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor"
    });
  }
});

// Rota para extração de dados (mantendo compatibilidade)
app.get("/extract", async (req, res) => {
  try {
    const { url, method = "auto" } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: "URL é obrigatória" 
      });
    }

    logger.info(`Extração solicitada para: ${url}`);
    
    const extractedData = await webExtractor.extractData(url, method);
    
    res.json({
      success: true,
      data: extractedData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error("Erro na rota de extração:", error);
    res.status(500).json({ 
      success: false, 
      error: "Erro interno do servidor" 
    });
  }
});

// Rota para chat com IA
app.post("/chat", async (req, res) => {
  try {
    const { message, url, conversationId = "default", instructionsId } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: "Mensagem é obrigatória" 
      });
    }

    let pageData;
    
    if (url) {
      // Extrair dados da URL se fornecida
      pageData = await webExtractor.extractData(url);
    } else {
      // Usar dados padrão se não houver URL
      pageData = webExtractor.getDefaultData("");
    }

    // 🔒 RECUPERAR INSTRUÇÕES PERSONALIZADAS (se fornecido ID)
    let customInstructions = null;
    if (instructionsId) {
      customInstructions = getInstructionsById(instructionsId);
      if (customInstructions) {
        logger.info(`Instruções personalizadas aplicadas: ${instructionsId}`);
      }
    }

    // Recuperar histórico da conversa
    const conversationKey = `${conversationId}_${url || "default"}`;
    let conversation = conversationCache.get(conversationKey) || { messages: [], timestamp: Date.now() };
    
    // Limpar conversas antigas
    if (Date.now() - conversation.timestamp > CONVERSATION_TTL) {
      conversation = { messages: [], timestamp: Date.now() };
    }

    // Gerar resposta contextual
    const aiResponse = await generateContextualResponse(
      message, 
      pageData, 
      conversation.messages,
      customInstructions // 🔒 PASSAR INSTRUÇÕES PERSONALIZADAS
    );

    // Atualizar histórico da conversa
    conversation.messages.push(
      { role: "user", content: message, timestamp: Date.now() },
      { role: "assistant", content: aiResponse.response, timestamp: Date.now() }
    );
    
    // Manter apenas as últimas 20 mensagens
    if (conversation.messages.length > 20) {
      conversation.messages = conversation.messages.slice(-20);
    }
    
    conversation.timestamp = Date.now();
    conversationCache.set(conversationKey, conversation);

    res.json({
      success: true,
      response: aiResponse.response,
      intent: aiResponse.intent,
      confidence: aiResponse.confidence,
      conversationId: conversationId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error("Erro na rota de chat:", error);
    res.status(500).json({ 
      success: false, 
      error: "Erro interno do servidor" 
    });
  }
});

// Rota principal do chatbot (interface)
app.get("/chatbot", async (req, res) => {
  try {
    const { url, robot, inst_id } = req.query; // 🔒 MUDANÇA: inst_id em vez de instructions
    
    if (!url) {
      return res.status(400).send("URL é obrigatória");
    }

    // Extrair dados da página
    const pageData = await webExtractor.extractData(url);
    pageData.robotName = robot || "Assistente Virtual";

    // 🔒 RECUPERAR INSTRUÇÕES PERSONALIZADAS (se fornecido ID)
    let customInstructions = null;
    if (inst_id) {
      customInstructions = getInstructionsById(inst_id);
      if (customInstructions) {
        logger.info(`Instruções personalizadas carregadas para chatbot: ${inst_id}`);
      }
    }

    // Detectar dispositivo
    const deviceInfo = detectDeviceAndPlatform(req.headers["user-agent"] || "");

    // HTML do chatbot (MANTENDO TODA A FUNCIONALIDADE EXISTENTE)
    const chatbotHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageData.robotName} - Chat Inteligente</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .chat-header {
            background: rgba(255,255,255,0.95);
            padding: 20px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .chat-header h1 {
            color: #333;
            font-size: 1.5em;
            margin-bottom: 5px;
        }
        
        .chat-header p {
            color: #666;
            font-size: 0.9em;
        }
        
        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            max-width: 800px;
            margin: 0 auto;
            width: 100%;
            background: white;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        
        .chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #f8f9fa;
        }
        
        .message {
            margin-bottom: 15px;
            display: flex;
            align-items: flex-start;
        }
        
        .message.user {
            justify-content: flex-end;
        }
        
        .message.bot {
            justify-content: flex-start;
        }
        
        .message-content {
            max-width: 70%;
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
        }
        
        .message.user .message-content {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border-bottom-right-radius: 4px;
        }
        
        .message.bot .message-content {
            background: white;
            color: #333;
            border: 1px solid #e1e5e9;
            border-bottom-left-radius: 4px;
        }
        
        .chat-input-container {
            padding: 20px;
            background: white;
            border-top: 1px solid #e1e5e9;
        }
        
        .chat-input-form {
            display: flex;
            gap: 10px;
        }
        
        .chat-input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e1e5e9;
            border-radius: 25px;
            font-size: 16px;
            outline: none;
            transition: border-color 0.3s ease;
        }
        
        .chat-input:focus {
            border-color: #667eea;
        }
        
        .send-button {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 600;
            transition: transform 0.2s ease;
        }
        
        .send-button:hover {
            transform: translateY(-1px);
        }
        
        .send-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .typing-indicator {
            display: none;
            padding: 12px 16px;
            background: white;
            border: 1px solid #e1e5e9;
            border-radius: 18px;
            border-bottom-left-radius: 4px;
            max-width: 70%;
        }
        
        .typing-dots {
            display: flex;
            gap: 4px;
        }
        
        .typing-dot {
            width: 8px;
            height: 8px;
            background: #999;
            border-radius: 50%;
            animation: typing 1.4s infinite ease-in-out;
        }
        
        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes typing {
            0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
        }
        
        .product-info {
            background: linear-gradient(135deg, #e8f5e8, #f0f8f0);
            padding: 15px;
            margin: 10px 0;
            border-radius: 10px;
            border-left: 4px solid #28a745;
        }
        
        .product-info h3 {
            color: #155724;
            margin-bottom: 8px;
            font-size: 1.1em;
        }
        
        .product-info p {
            color: #155724;
            font-size: 0.9em;
            margin-bottom: 5px;
        }
        
        @media (max-width: 600px) {
            .chat-container {
                height: 100vh;
                border-radius: 0;
            }
            
            .message-content {
                max-width: 85%;
            }
            
            .chat-header {
                padding: 15px;
            }
            
            .chat-header h1 {
                font-size: 1.3em;
            }
        }
    </style>
</head>
<body>
    <div class="chat-header">
        <h1>🤖 ${pageData.robotName}</h1>
        <p>Assistente inteligente para ${pageData.title}</p>
    </div>
    
    <div class="chat-container">
        <div class="chat-messages" id="chatMessages">
            <div class="message bot">
                <div class="message-content">
                    Olá! Sou ${pageData.robotName} e estou aqui para te ajudar com <strong>${pageData.title}</strong>! 😊
                    
                    <div class="product-info">
                        <h3>📋 Informações do Produto</h3>
                        <p><strong>💰 Preço:</strong> ${pageData.price}</p>
                        <p><strong>✨ Principais benefícios:</strong> ${pageData.benefits.slice(0, 3).join(", ")}</p>
                    </div>
                    
                    Como posso te ajudar hoje?
                </div>
            </div>
            
            <div class="message bot">
                <div class="typing-indicator" id="typingIndicator">
                    <div class="typing-dots">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="chat-input-container">
            <form class="chat-input-form" id="chatForm">
                <input 
                    type="text" 
                    class="chat-input" 
                    id="messageInput" 
                    placeholder="Digite sua mensagem..."
                    required
                    autocomplete="off"
                >
                <button type="submit" class="send-button" id="sendButton">
                    Enviar
                </button>
            </form>
        </div>
    </div>

    <script>
        const chatMessages = document.getElementById("chatMessages");
        const messageInput = document.getElementById("messageInput");
        const sendButton = document.getElementById("sendButton");
        const chatForm = document.getElementById("chatForm");
        const typingIndicator = document.getElementById("typingIndicator");
        
        const conversationId = "conv_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        const pageUrl = "${url}";
        const instructionsId = "${inst_id || ""}"; // 🔒 ID das instruções (não as instruções em si)
        
        function addMessage(content, isUser = false) {
            const messageDiv = document.createElement("div");
            messageDiv.className = "message " + (isUser ? "user" : "bot");
            
            const contentDiv = document.createElement("div");
            contentDiv.className = "message-content";
            contentDiv.innerHTML = content;
            
            messageDiv.appendChild(contentDiv);
            
            // Inserir antes do indicador de digitação
            chatMessages.insertBefore(messageDiv, typingIndicator.parentElement);
            
            // Scroll para a última mensagem
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        function showTyping() {
            typingIndicator.style.display = "block";
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        function hideTyping() {
            typingIndicator.style.display = "none";
        }
        
        async function sendMessage(message) {
            try {
                showTyping();
                sendButton.disabled = true;
                
                const response = await fetch("/chat", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        message: message,
                        url: pageUrl,
                        conversationId: conversationId,
                        instructionsId: instructionsId // 🔒 ENVIAR ID DAS INSTRUÇÕES
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    addMessage(data.response);
                } else {
                    addMessage("Desculpe, ocorreu um erro. Tente novamente.");
                }
                
            } catch (error) {
                console.error("Erro ao enviar mensagem:", error);
                addMessage("Desculpe, ocorreu um erro de conexão. Tente novamente.");
            } finally {
                hideTyping();
                sendButton.disabled = false;
                messageInput.focus();
            }
        }
        
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const message = messageInput.value.trim();
            if (!message) return;
            
            addMessage(message, true);
            messageInput.value = "";
            
            await sendMessage(message);
        });
        
        // Auto-focus no input
        messageInput.focus();
        
        // Remover o indicador de digitação inicialmente
        hideTyping();
    </script>
</body>
</html>`;

    res.send(chatbotHTML);

  } catch (error) {
    logger.error("Erro na rota do chatbot:", error);
    res.status(500).send("Erro interno do servidor");
  }
});

// Rota para deep links
app.get("/share/:platform", (req, res) => {
  try {
    const { platform } = req.params;
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: "URL é obrigatória" 
      });
    }

    const deviceInfo = detectDeviceAndPlatform(req.headers["user-agent"] || "");
    const deepLinks = generateDeepLinks(url, platform, deviceInfo);

    res.json({
      success: true,
      platform: platform,
      links: deepLinks,
      deviceInfo: deviceInfo
    });

  } catch (error) {
    logger.error("Erro na rota de deep links:", error);
    res.status(500).json({ 
      success: false, 
      error: "Erro interno do servidor" 
    });
  }
});

// Rota de status
app.get("/status", (req, res) => {
  res.json({
    status: "online",
    version: "6.0.1-SUPER-CORRIGIDO",
    timestamp: new Date().toISOString(),
    caches: {
      data: dataCache.size,
      conversations: conversationCache.size,
      intents: intentCache.size,
      instructions: instructionsCache.size // 🔒 NOVO CACHE
    }
  });
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  logger.error("Erro não tratado:", error);
  res.status(500).json({
    success: false,
    error: "Erro interno do servidor"
  });
});

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
  console.log(`🚀 LinkMágico Chatbot v6.0.1-SUPER-CORRIGIDO rodando na porta ${PORT}`);
  console.log(`📊 Extração SUPER REFINADA com Cheerio + Axios`);
  console.log(`🎯 Descrição e Preço muito mais precisos`);
  console.log(`🤖 IA SUPER INTELIGENTE com respostas contextuais`);
  console.log(`💬 Sistema de conversação com histórico`);
  console.log(`🔒 INSTRUÇÕES PERSONALIZADAS SEGURAS (CORREÇÃO PRINCIPAL)`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
});

module.exports = app;

