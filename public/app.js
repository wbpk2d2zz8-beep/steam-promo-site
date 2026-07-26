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
const carrosselTrilho = document.getElementById("carrossel-trilho");
const carrosselBolinhas = document.getElementById("carrossel-bolinhas");

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

// ── Carrossel de destaques — melhores notas, independente do % de desconto ──
// Ao contrário da versão anterior (animação CSS contínua), aqui a troca de
// slide é feita mudando `transform: translateX` via JS a cada alguns segundos.
// Isso funciona mesmo com "reduzir movimento" ativado no sistema operacional,
// já que não depende de @keyframes/animation do CSS.
const JOGOS_POR_SLIDE = 4;
const INTERVALO_SLIDE_MS = 4000;

let carrosselSlides = 0;
let carrosselAtual = 0;
let carrosselIntervalo = null;
let destaquesCarregados = false;

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

function irParaSlide(indice) {
  if (!carrosselTrilho || carrosselSlides === 0) return;
  carrosselAtual = ((indice % carrosselSlides) + carrosselSlides) % carrosselSlides;
  carrosselTrilho.style.transform = `translateX(-${carrosselAtual * 100}%)`;

  // Atualiza qual bolinha está marcada como ativa
  const bolinhas = carrosselBolinhas.querySelectorAll(".carrossel-bolinha");
  bolinhas.forEach((b, i) => b.classList.toggle("ativa", i === carrosselAtual));
}

function reiniciarAutoAvanco() {
  if (carrosselIntervalo) clearInterval(carrosselIntervalo);
  if (carrosselSlides <= 1) return; // nada a avançar com 1 slide só
  carrosselIntervalo = setInterval(() => {
    irParaSlide(carrosselAtual + 1);
  }, INTERVALO_SLIDE_MS);
}

async function carregarDestaques() {
  if (!carrosselTrilho || destaquesCarregados) return;
  try {
    // Cache completo, sem os filtros do usuário — exige só ALGUM desconto (>=1%).
    const params = new URLSearchParams({ desconto: "1", nota: "0", excluirIndie: "false" });
    const resp = await fetch(`/api/promocoes?${params}`);
    const data = await resp.json();
    if (!data.ok || !data.jogos.length) return;

    // Melhores notas primeiro (a API já ordena assim), pega um top 12
    const destaques = data.jogos.slice(0, 12);
    if (!destaques.length) return;

    // Monta os slides — cada um com até JOGOS_POR_SLIDE cards
    carrosselTrilho.innerHTML = "";
    carrosselBolinhas.innerHTML = "";
    carrosselSlides = Math.ceil(destaques.length / JOGOS_POR_SLIDE);

    for (let i = 0; i < carrosselSlides; i++) {
      const slide = document.createElement("div");
      slide.className = "carrossel-slide";
      const grupo = destaques.slice(i * JOGOS_POR_SLIDE, i * JOGOS_POR_SLIDE + JOGOS_POR_SLIDE);
      grupo.forEach((jogo) => slide.appendChild(criarCardDestaque(jogo)));
      carrosselTrilho.appendChild(slide);

      const bolinha = document.createElement("button");
      bolinha.className = "carrossel-bolinha";
      bolinha.type = "button";
      bolinha.setAttribute("aria-label", `Ir para o grupo ${i + 1}`);
      bolinha.addEventListener("click", () => {
        irParaSlide(i);
        reiniciarAutoAvanco(); // clique manual reinicia a contagem do avanço automático
      });
      carrosselBolinhas.appendChild(bolinha);
    }

    destaquesCarregados = true;
    irParaSlide(0);
    reiniciarAutoAvanco();

    // Pausa o avanço automático enquanto o mouse estiver sobre o carrossel
    const wrap = carrosselTrilho.closest(".carrossel-wrap");
    if (wrap) {
      wrap.addEventListener("mouseenter", () => {
        if (carrosselIntervalo) clearInterval(carrosselIntervalo);
      });
      wrap.addEventListener("mouseleave", reiniciarAutoAvanco);
    }
  } catch (erro) {
    console.error("[destaques] erro ao carregar:", erro);
  }
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
