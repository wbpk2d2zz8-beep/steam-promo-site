const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Configurações (mesmas do bot Discord) ────────────────────────────────────
// O cache busca com critérios BEM ABERTOS (guarda praticamente tudo em promoção).
// Os filtros do usuário (sliders no site) filtram esse resultado já em memória,
// sem nunca gerar uma nova chamada à Steam — é isso que evita o bloqueio.
const DESCONTO_MINIMO_CACHE = 1;    // guarda a partir de -1% (verdadeiramente aberto — "tudo")
const NOTA_MINIMA_CACHE = 0;        // guarda mesmo jogos com nota baixa
const DESCONTO_MINIMO_PADRAO = parseInt(process.env.DESCONTO_MINIMO || "50", 10); // padrão exibido no site
const NOTA_MINIMA_PADRAO = parseInt(process.env.NOTA_MINIMA || "70", 10);         // padrão exibido no site
const ITAD_API_KEY = process.env.ITAD_API_KEY || "";
const HORAS_ENTRE_ATUALIZACOES = parseFloat(process.env.HORAS_ENTRE_ATUALIZACOES || "4");

// Ritmo "gotejado": processa um jogo de cada vez, com pausa entre eles — nada de rajada.
// Padrão: 6000ms (6s) entre jogos ≈ 10 jogos/minuto, como sugerido.
const MS_ENTRE_JOGOS = parseInt(process.env.MS_ENTRE_JOGOS || "6000", 10);
// Limite de jogos processados por atualização — igual ao bot do Discord (até 300),
// pra cobrir a mesma quantidade de promoções e não perder jogos que ficam nas páginas de trás.
// Com 150 jogos e 6s entre cada um, uma atualização completa leva ~15 minutos.
const MAX_JOGOS_POR_ATUALIZACAO = parseInt(process.env.MAX_JOGOS_POR_ATUALIZACAO || "150", 10);
const MAX_PAGINAS_BUSCA = parseInt(process.env.MAX_PAGINAS_BUSCA || "6", 10);

const STEAM_SEARCH_URL = "https://store.steampowered.com/search/results/";
const STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails";
const STEAM_REVIEWS_URL = (appid) => `https://store.steampowered.com/appreviews/${appid}`;
const ITAD_LOOKUP_URL = "https://api.isthereanydeal.com/games/lookup/v1";
const ITAD_PRICES_URL = "https://api.isthereanydeal.com/games/prices/v3";

const GENRE_INDIE = "Indie";

const HEADERS_STEAM = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://store.steampowered.com/search/?specials=1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "X-Requested-With": "XMLHttpRequest",
  Connection: "keep-alive",
};

// ── Utilidades de rede ────────────────────────────────────────────────────────
async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    if (!resp.ok) return null;
    try {
      return await resp.json();
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buscarPaginaBusca(start, count = 50) {
  const params = new URLSearchParams({
    start: String(start),
    count: String(count),
    specials: "1",
    cc: "br",
    l: "portuguese",
    category1: "998",
    json: "1",
  });
  const data = await fetchJson(`${STEAM_SEARCH_URL}?${params}`, { headers: HEADERS_STEAM });
  return data?.items || [];
}

function extrairAppId(item) {
  if (item.id) return item.id;
  if (item.appid) return item.appid;
  if (item.logo) {
    const m = item.logo.match(/\/apps\/(\d+)\//);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

async function buscarDetalhesJogo(appid) {
  const params = new URLSearchParams({ appids: String(appid), cc: "br", l: "portuguese" });
  const data = await fetchJson(`${STEAM_APPDETAILS_URL}?${params}`, { headers: HEADERS_STEAM });
  const entry = data?.[String(appid)];
  if (!entry || !entry.success) return null;
  return entry.data;
}

async function buscarAvaliacao(appid) {
  const params = new URLSearchParams({
    json: "1",
    language: "all",
    purchase_type: "all",
    num_per_page: "0",
  });
  const data = await fetchJson(`${STEAM_REVIEWS_URL(appid)}?${params}`, { headers: HEADERS_STEAM });
  const summary = data?.query_summary;
  if (!summary) return null;
  const total = summary.total_reviews || 0;
  if (total === 0) return { percentual: 0, total: 0, descricao: "Sem avaliações" };
  return {
    percentual: Math.round((summary.total_positive / total) * 100),
    total,
    descricao: summary.review_score_desc || "",
  };
}

async function buscarItadGameId(appid) {
  if (!ITAD_API_KEY) return null;
  const params = new URLSearchParams({ key: ITAD_API_KEY, appid: String(appid) });
  const data = await fetchJson(`${ITAD_LOOKUP_URL}?${params}`, { headers: HEADERS_STEAM });
  if (!data?.found) return null;
  return data.game?.id || null;
}

async function buscarPrecoMinimoHistorico(itadGameId) {
  if (!ITAD_API_KEY || !itadGameId) return null;
  const params = new URLSearchParams({ key: ITAD_API_KEY, country: "BR" });
  const data = await fetchJson(`${ITAD_PRICES_URL}?${params}`, {
    method: "POST",
    headers: { ...HEADERS_STEAM, "Content-Type": "application/json" },
    body: JSON.stringify([itadGameId]),
  });
  const entry = data?.[0];
  const historyLow = entry?.historyLow?.all;
  if (!historyLow) return null;

  let dataPromocao = null;
  for (const deal of entry.deals || []) {
    if (deal.shop?.name === "Steam") {
      dataPromocao = deal.timestamp;
      break;
    }
  }
  return { precoMinimo: historyLow.amount || 0, dataPromocao };
}

// ── Processamento de um jogo (mesma lógica do bot) ────────────────────────────
async function processarJogo(item, descontoMinimo, notaMinima, excluirIndie) {
  const appid = extrairAppId(item);
  if (!appid) return null;

  const detalhes = await buscarDetalhesJogo(appid);
  if (!detalhes) return null;

  const tipo = detalhes.type;
  if (tipo && tipo !== "game") return null;

  const precoInfo = detalhes.price_overview;
  if (!precoInfo) return null;

  const desconto = precoInfo.discount_percent || 0;
  if (desconto < descontoMinimo) return null;

  const generos = (detalhes.genres || []).map((g) => g.description);
  if (excluirIndie && generos.includes(GENRE_INDIE)) return null;

  const avaliacao = await buscarAvaliacao(appid);
  if (!avaliacao || avaliacao.total < 10) return null;
  if (avaliacao.percentual < notaMinima) return null;

  let precoMinimoHistorico = null;
  let dataPromocaoHistorica = null;
  const itadId = await buscarItadGameId(appid);
  if (itadId) {
    const historico = await buscarPrecoMinimoHistorico(itadId);
    if (historico) {
      precoMinimoHistorico = historico.precoMinimo;
      dataPromocaoHistorica = historico.dataPromocao;
    }
  }

  return {
    appid,
    nome: detalhes.name || item.name || "Desconhecido",
    desconto,
    precoOriginal: (precoInfo.initial || 0) / 100,
    precoFinal: (precoInfo.final || 0) / 100,
    precoMinimoHistorico,
    dataPromocaoHistorica,
    imagem: detalhes.header_image || "",
    url: `https://store.steampowered.com/app/${appid}`,
    generos,
    avaliacaoPercentual: avaliacao.percentual,
    avaliacaoTotal: avaliacao.total,
  };
}

// ── Cache — a busca roda sozinha em segundo plano, o site nunca busca "na hora" ──
// Isso evita martelar a API da Steam a cada visita (e o bloqueio que isso causava).
// O cache guarda TUDO (critérios abertos); os filtros do usuário atuam em cima
// desse conjunto já pronto, na memória — nenhum filtro gera chamada nova à Steam.
// IMPORTANTE: o cache é preenchido JOGO POR JOGO conforme processa, não só no final —
// assim dá pra acompanhar o progresso em tempo real, mesmo com a busca levando minutos.
let cache = {
  jogos: [],
  atualizadoEm: null, // só vira uma data quando a atualização TERMINA por completo
  atualizando: false,
  progresso: 0,       // quantos jogos já foram processados nesta atualização
  progressoTotal: 0,  // quantos jogos existem pra processar nesta atualização
  erro: null,
};

async function processarSequencialComCache(itens, msEntreJogos, descontoMinimo, notaMinima, excluirIndie) {
  const vistos = new Set(cache.jogos.map((j) => j.appid));
  cache.progressoTotal = itens.length;
  cache.progresso = 0;

  for (let i = 0; i < itens.length; i++) {
    const r = await processarJogo(itens[i], descontoMinimo, notaMinima, excluirIndie);
    if (r && !vistos.has(r.appid)) {
      vistos.add(r.appid);
      cache.jogos.push(r);
      cache.jogos.sort((a, b) => b.avaliacaoPercentual - a.avaliacaoPercentual || b.desconto - a.desconto);
    }
    cache.progresso = i + 1;
    if (i < itens.length - 1) {
      await new Promise((res) => setTimeout(res, msEntreJogos));
    }
  }
}

async function atualizarCache() {
  if (cache.atualizando) return; // evita duas atualizações simultâneas
  cache.atualizando = true;
  cache.jogos = []; // começa do zero a cada ciclo, mas vai reaparecendo aos poucos
  cache.progresso = 0;
  cache.progressoTotal = 0;
  console.log("[CACHE] Iniciando atualização das promoções...");
  try {
    let brutos = [];
    for (let pagina = 0; pagina < MAX_PAGINAS_BUSCA; pagina++) {
      const items = await buscarPaginaBusca(pagina * 50, 50);
      if (!items.length) break;
      brutos = brutos.concat(items);
      if (brutos.length >= MAX_JOGOS_POR_ATUALIZACAO) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    brutos = brutos.slice(0, MAX_JOGOS_POR_ATUALIZACAO);

    if (brutos.length) {
      await processarSequencialComCache(brutos, MS_ENTRE_JOGOS, DESCONTO_MINIMO_CACHE, NOTA_MINIMA_CACHE, false);
    }

    cache.atualizadoEm = new Date().toISOString();
    cache.erro = null;
    console.log(`[CACHE] Atualizado com sucesso: ${cache.jogos.length} jogos guardados no total.`);
  } catch (erro) {
    cache.erro = String(erro);
    console.error("[CACHE] Falha ao atualizar:", erro);
  } finally {
    cache.atualizando = false;
  }
}

function filtrarCache(descontoMinimo, notaMinima, excluirIndie) {
  return cache.jogos.filter((jogo) => {
    if (jogo.desconto < descontoMinimo) return false;
    if (jogo.avaliacaoPercentual < notaMinima) return false;
    if (excluirIndie && (jogo.generos || []).includes(GENRE_INDIE)) return false;
    return true;
  });
}

// ── Servidor Express ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/promocoes", (req, res) => {
  const desconto = parseInt(req.query.desconto, 10) || DESCONTO_MINIMO_PADRAO;
  const nota = parseInt(req.query.nota, 10) || NOTA_MINIMA_PADRAO;
  const excluirIndie = req.query.excluirIndie !== "false";

  const jogosFiltrados = filtrarCache(desconto, nota, excluirIndie);

  res.json({
    ok: true,
    total: jogosFiltrados.length,
    totalNoCache: cache.jogos.length,
    itadAtivo: Boolean(ITAD_API_KEY),
    atualizadoEm: cache.atualizadoEm,
    atualizando: cache.atualizando,
    progresso: cache.progresso,
    progressoTotal: cache.progressoTotal,
    erro: cache.erro,
    jogos: jogosFiltrados,
  });
});

// Endpoint opcional para forçar atualização manualmente (ex: você mesmo, se quiser)
app.post("/api/atualizar", async (req, res) => {
  if (cache.atualizando) {
    return res.json({ ok: true, mensagem: "Já tem uma atualização em andamento." });
  }
  atualizarCache(); // não espera terminar, só dispara
  res.json({ ok: true, mensagem: "Atualização iniciada em segundo plano." });
});

// ── Diagnóstico (mesmo princípio do !debug do bot Discord) ───────────────────
app.get("/api/debug", async (req, res) => {
  const linhas = [];

  try {
    const params = new URLSearchParams({
      start: "0",
      count: "10",
      specials: "1",
      cc: "br",
      l: "portuguese",
      category1: "998",
      json: "1",
    });
    const url = `${STEAM_SEARCH_URL}?${params}`;
    const resp = await fetch(url, { headers: HEADERS_STEAM });
    const texto = await resp.text();
    linhas.push(`1. Busca de promoções -> status HTTP ${resp.status}`);

    let items = [];
    try {
      const data = JSON.parse(texto);
      items = data.items || [];
      linhas.push(`   JSON válido, ${items.length} jogos recebidos`);
      if (items.length) {
        linhas.push(`   Exemplo: ${items[0].name} | chaves: ${Object.keys(items[0]).join(", ")}`);
      }
    } catch (e) {
      linhas.push(`   Resposta NÃO é JSON válido: ${e.message}`);
      linhas.push(`   Início da resposta: ${texto.slice(0, 300)}`);
    }

    if (items.length > 0) {
      for (let i = 0; i < Math.min(3, items.length); i++) {
        const item = items[i];
        const appid = extrairAppId(item);
        if (!appid) {
          linhas.push(`   Item ${i + 1} (${item.name}): parou na extração do appid`);
          continue;
        }
        const detalhes = await buscarDetalhesJogo(appid);
        if (!detalhes) {
          linhas.push(`   Item ${i + 1} (${item.name}, appid ${appid}): appdetails retornou null`);
          continue;
        }
        const tipo = detalhes.type;
        const precoInfo = detalhes.price_overview;
        const desconto = precoInfo?.discount_percent;
        const avaliacao = await buscarAvaliacao(appid);
        linhas.push(
          `   Item ${i + 1} (${detalhes.name}, appid ${appid}): type=${tipo} desconto=${desconto} ` +
            `nota=${avaliacao?.percentual}% total_reviews=${avaliacao?.total}`
        );
      }
    }
  } catch (e) {
    linhas.push(`ERRO GERAL: ${e.message}`);
  }

  res.type("text/plain").send(linhas.join("\n"));
});

app.listen(PORT, () => {
  const estimativaMin = Math.ceil((MAX_JOGOS_POR_ATUALIZACAO * MS_ENTRE_JOGOS) / 60000);
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`   ITAD configurado: ${ITAD_API_KEY ? "sim" : "não"}`);
  console.log(`   Atualizando promoções a cada ${HORAS_ENTRE_ATUALIZACOES}h`);
  console.log(`   Ritmo: 1 jogo a cada ${MS_ENTRE_JOGOS / 1000}s (~${estimativaMin} min por atualização completa)`);

  // Primeira busca ao ligar o servidor (não bloqueia o listen, roda em paralelo)
  atualizarCache();

  // Atualizações periódicas em segundo plano
  setInterval(atualizarCache, HORAS_ENTRE_ATUALIZACOES * 60 * 60 * 1000);
});
