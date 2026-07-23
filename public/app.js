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

// ── Carrega e filtra o cache já pronto (não dispara busca nova na Steam) ────
// Os parâmetros vão na URL, mas o servidor só filtra em memória — instantâneo.
async function carregarVitrine() {
  const desconto = inputDesconto.value;
  const nota = inputNota.value;
  const excluirIndie = inputIndie.checked;

  areaResultado.hidden = true;
  areaVazio.hidden = true;
  areaErro.hidden = true;
  areaStatus.hidden = false;

  try {
    const params = new URLSearchParams({ desconto, nota, excluirIndie: String(excluirIndie) });
    const resp = await fetch(`/api/promocoes?${params}`);
    const data = await resp.json();

    areaStatus.hidden = true;

    if (!data.ok) {
      throw new Error(data.erro || "Erro desconhecido");
    }

    rodapeItad.textContent = data.itadAtivo ? " + IsThereAnyDeal (preço histórico)" : "";

    const dataHoraTxt = formatarDataHora(data.atualizadoEm);
    if (dataHoraTxt) {
      infoAtualizacao.textContent = `Vitrine atualizada em: ${dataHoraTxt} · ${data.totalNoCache} jogos em promoção no total`;
    } else if (data.erro) {
      infoAtualizacao.textContent = "A primeira busca ainda não terminou ou falhou — tenta recarregar em instantes.";
    } else {
      infoAtualizacao.textContent = "Buscando as promoções pela primeira vez, isso pode levar alguns minutos...";
    }

    if (!data.jogos.length) {
      areaVazio.hidden = false;
      return;
    }

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

// Se a busca inicial do servidor ainda não tiver terminado, tenta de novo em alguns segundos
setTimeout(() => {
  if (!infoAtualizacao.textContent.startsWith("Vitrine atualizada")) {
    carregarVitrine();
  }
}, 15000);
