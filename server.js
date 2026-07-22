const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Configurações (mesmas do bot Discord) ────────────────────────────────────
const DESCONTO_MINIMO_PADRAO = parseInt(process.env.DESCONTO_MINIMO || "50", 10);
const NOTA_MINIMA_PADRAO = parseInt(process.env.NOTA_MINIMA || "70", 10);
const ITAD_API_KEY = process.env.ITAD_API_KEY || "";
const HORAS_ENTRE_ATUALIZACOES = parseFloat(process.env.HORAS_ENTRE_ATUALIZACOES || "4");

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

async function processarComLimite(itens, limite, descontoMinimo, notaMinima, excluirIndie) {
  const resultados = [];
  let indice = 0;

  async function worker() {
    while (indice < itens.length) {
      const meuIndice = indice++;
      const r = await processarJogo(itens[meuIndice], descontoMinimo, notaMinima, excluirIndie);
      if (r) resultados.push(r);
      await new Promise((res) => setTimeout(res, 150)); // espaçamento pra não sobrecarregar a Steam
    }
  }

  const workers = Array.from({ length: limite }, () => worker());
  await Promise.all(workers);
  return resultados;
}

async function buscarPromocoes({
  descontoMinimo = DESCONTO_MINIMO_PADRAO,
  notaMinima = NOTA_MINIMA_PADRAO,
  excluirIndie = true,
  maxPaginas = 4,
} = {}) {
  let brutos = [];
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const items = await buscarPaginaBusca(pagina * 50, 50);
    if (!items.length) break;
    brutos = brutos.concat(items);
    if (brutos.length >= 200) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!brutos.length) return [];

  const processados = await processarComLimite(brutos, 6, descontoMinimo, notaMinima, excluirIndie);

  const vistos = new Set();
  const final = [];
  for (const jogo of processados) {
    if (!vistos.has(jogo.appid)) {
      vistos.add(jogo.appid);
      final.push(jogo);
    }
  }

  final.sort((a, b) => b.avaliacaoPercentual - a.avaliacaoPercentual || b.desconto - a.desconto);
  return final;
}

// ── Cache — a busca roda sozinha em segundo plano, o site nunca busca "na hora" ──
// Isso evita martelar a API da Steam a cada visita (e o bloqueio que isso causava).
let cache = {
  jogos: [],
  atualizadoEm: null,
  atualizando: false,
  erro: null,
};

async function atualizarCache() {
  if (cache.atualizando) return; // evita duas atualizações simultâneas
  cache.atualizando = true;
  console.log("[CACHE] Iniciando atualização das promoções...");
  try {
    const jogos = await buscarPromocoes({
      descontoMinimo: DESCONTO_MINIMO_PADRAO,
      notaMinima: NOTA_MINIMA_PADRAO,
      excluirIndie: true,
    });
    cache.jogos = jogos;
    cache.atualizadoEm = new Date().toISOString();
    cache.erro = null;
    console.log(`[CACHE] Atualizado com sucesso: ${jogos.length} jogos encontrados.`);
  } catch (erro) {
    cache.erro = String(erro);
    console.error("[CACHE] Falha ao atualizar:", erro);
  } finally {
    cache.atualizando = false;
  }
}

// ── Servidor Express ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/promocoes", (req, res) => {
  res.json({
    ok: true,
    total: cache.jogos.length,
    itadAtivo: Boolean(ITAD_API_KEY),
    atualizadoEm: cache.atualizadoEm,
    erro: cache.erro,
    jogos: cache.jogos,
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
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`   ITAD configurado: ${ITAD_API_KEY ? "sim" : "não"}`);
  console.log(`   Atualizando promoções a cada ${HORAS_ENTRE_ATUALIZACOES}h`);

  // Primeira busca ao ligar o servidor (não bloqueia o listen, roda em paralelo)
  atualizarCache();

  // Atualizações periódicas em segundo plano
  setInterval(atualizarCache, HORAS_ENTRE_ATUALIZACOES * 60 * 60 * 1000);
});
