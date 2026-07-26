// ── Elementos ──────────────────────────────────────────────────────────────
const inputDesconto = document.getElementById("input-desconto");
const valorDesconto = document.getElementById("valor-desconto");
const inputNota = document.getElementById("input-nota");
const valorNota = document.getElementById("valor-nota");
const inputIndie = document.getElementById("input-indie");

const areaStatus = document.getElementById("area-status");
const areaResultado = document.getElementById("area-resultado");
const resultadoTitulo = document.getElementById("resultado-titulo");
const resultadoSub = document.getElementById("resultado-sub");
const gradeJogos = document.getElementById("grade-jogos");
const areaVazio = document.getElementById("area-vazio");
const areaErro = document.getElementById("area-erro");
const erroDetalhe = document.getElementById("erro-detalhe");
const rodapeItad = document.getElementById("rodape-itad");
const infoAtualizacao = document.getElementById("info-atualizacao");
const destaquesEsteira = document.getElementById("destaques-esteira");

// ── Sliders refletindo valor ao vivo ────────────────────────────────────────
inputDesconto.addEventListener("input", () => {
  valorDesconto.textContent = `${inputDesconto.value}%`;
});
inputNota.addEventListener("input", () => {
  valorNota.textContent = `${inputNota.value}%`;
});

// Refiltra automaticamente quando o usuário solta o controle (sem precisar de botão)
// "change" dispara ao soltar o slider/marcar o checkbox — não a cada pixel arrastado
inputDesconto.addEventListener("change", carregarVitrine);
inputNota.addEventListener("change", carregarVitrine);
inputIndie.addEventListener("change", carregarVitrine);

// ── Formatação ───────────────────────────────────────────────────────────────
function formatarReal(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(isoString) {
  if (!isoString) return null;
  try {
    const dt = new Date(isoString);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return null;
  }
}

function formatarDataHora(isoString) {
  if (!isoString) return null;
  try {
    const dt = new Date(isoString);
    return dt.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// ── Criação de card ──────────────────────────────────────────────────────────
function criarCardJogo(jogo) {
  const a = document.createElement("a");
  a.className = "card-jogo";
  a.href = jogo.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const ehMenorHistorico =
    jogo.precoMinimoHistorico != null && jogo.precoFinal <= jogo.precoMinimoHistorico + 0.01;

  let blocoHistorico = "";
  if (jogo.precoMinimoHistorico != null) {
    if (ehMenorHistorico) {
      blocoHistorico = `<div class="card-historico-linha card-historico-melhor">🏆 Menor preço histórico!</div>`;
    } else {
      const dataTxt = formatarData(jogo.dataPromocaoHistorica);
      blocoHistorico = `<div class="card-historico-linha">Menor histórico: <strong>${formatarReal(
        jogo.precoMinimoHistorico
      )}</strong>${dataTxt ? ` <span style="opacity:.7">(${dataTxt})</span>` : ""}</div>`;
    }
  }

  const precosHtml =
    jogo.precoFinal > 0
      ? `<div class="card-precos">
           <span class="card-preco-original">${formatarReal(jogo.precoOriginal)}</span>
           <span class="card-preco-final">${formatarReal(jogo.precoFinal)}</span>
         </div>`
      : `<div class="card-precos"><span class="card-preco-gratis">GRÁTIS</span></div>`;

  const generosHtml = (jogo.generos || [])
    .slice(0, 3)
    .map((g) => `<span class="card-genero-chip">${escaparHtml(g)}</span>`)
    .join("");

  a.innerHTML = `
    <div class="card-imagem-wrap">
      <img src="${jogo.imagem}" alt="${escaparHtml(jogo.nome)}" loading="lazy" />
      <span class="card-tag-desconto">-${jogo.desconto}%</span>
      ${ehMenorHistorico ? '<span class="card-tag-historico">✦ recorde</span>' : ""}
    </div>
    <div class="card-corpo">
      <h3 class="card-titulo">${escaparHtml(jogo.nome)}</h3>
      <div class="card-generos">${generosHtml}</div>
      ${precosHtml}
      ${blocoHistorico}
      <div class="card-rodape">
        <span class="card-avaliacao">${jogo.avaliacaoPercentual}% positivas
          <span class="card-avaliacao-total">(${jogo.avaliacaoTotal.toLocaleString("pt-BR")})</span>
        </span>
      </div>
    </div>
  `;

  return a;
}

// ── Esteira de destaques — melhores notas, independente do % de desconto ────
// Roda sozinha via CSS (animação de translateX); aqui só populamos o conteúdo,
// duplicado uma vez, pra o loop infinito não ter salto perceptível.
function criarCardDestaque(jogo) {
  const a = document.createElement("a");
  a.className = "destaque-card";
  a.href = jogo.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.innerHTML = `
    <img src="${jogo.imagem}" alt="${escaparHtml(jogo.nome)}" loading="lazy" />
    <span class="destaque-desconto">-${jogo.desconto}%</span>
    <span class="destaque-nota">★ ${jogo.avaliacaoPercentual}%</span>
    <div class="destaque-legenda">${escaparHtml(jogo.nome)}</div>
  `;
  return a;
}

let destaquesCarregados = false;

async function carregarDestaques() {
  if (!destaquesEsteira || destaquesCarregados) return;
  try {
    // Cache completo, sem os filtros do usuário — exige só ALGUM desconto (>=1%).
    const params = new URLSearchParams({ desconto: "1", nota: "0", excluirIndie: "false" });
    const resp = await fetch(`/api/promocoes?${params}`);
    const data = await resp.json();
    if (!data.ok || !data.jogos.length) return;

    // Melhores notas primeiro (a API já ordena assim), pega um top 12
    const destaques = data.jogos.slice(0, 12);
    if (!destaques.length) return;

    destaquesEsteira.innerHTML = "";
    // Duplica a lista uma vez — a animação percorre exatamente 50% da largura,
    // então a cópia garante que o loop feche sem pulo visível.
    [...destaques, ...destaques].forEach((jogo) => {
      destaquesEsteira.appendChild(criarCardDestaque(jogo));
    });
    destaquesCarregados = true;
    configurarInteracaoEsteira();
  } catch {
    // Falha silenciosa — a esteira é decorativa, não deve quebrar o resto da página
  }
}

// Permite arrastar/scrollar a esteira manualmente: pausa a animação CSS
// enquanto o usuário interage (mouse, toque ou scroll) e retoma sozinha
// depois de um tempo parado — sem os dois métodos brigarem pela posição.
function configurarInteracaoEsteira() {
  const wrap = destaquesEsteira.closest(".destaques-esteira-wrap");
  if (!wrap) return;

  let timeoutRetomada = null;

  function pausar() {
    destaquesEsteira.classList.add("pausado");
    if (timeoutRetomada) clearTimeout(timeoutRetomada);
  }

  function agendarRetomada() {
    if (timeoutRetomada) clearTimeout(timeoutRetomada);
    timeoutRetomada = setTimeout(() => {
      destaquesEsteira.classList.remove("pausado");
    }, 2500);
  }

  wrap.addEventListener("mouseenter", pausar);
  wrap.addEventListener("mouseleave", agendarRetomada);
  wrap.addEventListener("touchstart", pausar, { passive: true });
  wrap.addEventListener("touchend", agendarRetomada);
  wrap.addEventListener("scroll", () => {
    pausar();
    agendarRetomada();
  });

  // Se a aba voltar a ficar visível depois de tempo em segundo plano,
  // alguns navegadores deixam a animação "presa" — isso força um reset limpo.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      destaquesEsteira.classList.add("pausado");
      // Força o navegador a recalcular o estilo antes de tirar a pausa,
      // evitando o "salto" que aconteceria retomando direto no meio do cálculo.
      void destaquesEsteira.offsetWidth;
      requestAnimationFrame(() => destaquesEsteira.classList.remove("pausado"));
    }
  });
}

// ── Carrega e filtra o cache já pronto (não dispara busca nova na Steam) ────
// Os parâmetros vão na URL, mas o servidor só filtra em memória — instantâneo.
let intervaloAcompanhamento = null;

let primeiraCarga = true;

async function carregarVitrine(silencioso = false) {
  const desconto = inputDesconto.value;
  const nota = inputNota.value;
  const excluirIndie = inputIndie.checked;

  // O spinner só faz sentido na primeiríssima carga, antes de saber se existe algum dado.
  // Trocar os sliders é filtro em memória — instantâneo, não precisa de tela de carregamento.
  if (primeiraCarga && !silencioso) {
    areaResultado.hidden = true;
    areaVazio.hidden = true;
    areaErro.hidden = true;
    areaStatus.hidden = false;
  }

  try {
    const params = new URLSearchParams({ desconto, nota, excluirIndie: String(excluirIndie) });
    const resp = await fetch(`/api/promocoes?${params}`);
    const data = await resp.json();

    areaStatus.hidden = true;
    primeiraCarga = false;

    if (!data.ok) {
      throw new Error(data.erro || "Erro desconhecido");
    }

    rodapeItad.textContent = data.itadAtivo ? " + IsThereAnyDeal (preço histórico)" : "";

    const dataHoraTxt = formatarDataHora(data.atualizadoEm);

    if (data.atualizando) {
      // Busca em andamento — mostra progresso e continua consultando sozinho, sem piscar a tela
      infoAtualizacao.textContent = `Buscando promoções: ${data.progresso}/${data.progressoTotal} jogos processados até agora (isso pode levar alguns minutos)`;
      if (!intervaloAcompanhamento) {
        intervaloAcompanhamento = setInterval(() => carregarVitrine(true), 8000);
      }
      carregarDestaques(); // tenta popular a esteira assim que já houver jogos suficientes no cache
    } else {
      // Terminou — não precisa mais ficar consultando sozinho
      if (intervaloAcompanhamento) {
        clearInterval(intervaloAcompanhamento);
        intervaloAcompanhamento = null;
      }
      if (dataHoraTxt) {
        infoAtualizacao.textContent = `Vitrine atualizada em: ${dataHoraTxt} · ${data.totalNoCache} jogos em promoção no total`;
      } else if (data.erro) {
        infoAtualizacao.textContent = "A busca falhou — tenta recarregar em instantes.";
      } else {
        infoAtualizacao.textContent = "Aguardando a primeira busca começar...";
      }
      carregarDestaques();
    }

    if (!data.jogos.length) {
      if (!silencioso || !data.atualizando) areaVazio.hidden = false;
      return;
    }

    areaVazio.hidden = true;
    resultadoTitulo.textContent = `${data.total} ${data.total === 1 ? "jogo encontrado" : "jogos encontrados"}`;
    resultadoSub.textContent = `Ordenados por nota de avaliação, depois por desconto · -${desconto}% ou mais · nota ≥ ${nota}%`;

    gradeJogos.innerHTML = "";
    data.jogos.forEach((jogo) => gradeJogos.appendChild(criarCardJogo(jogo)));

    areaResultado.hidden = false;
  } catch (erro) {
    areaStatus.hidden = true;
    erroDetalhe.textContent = erro.message || String(erro);
    areaErro.hidden = false;
  }
}

carregarVitrine();
