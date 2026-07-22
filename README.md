# 🎮 Vitrine de Promoções Steam (site)

Site que busca promoções da Steam **ao vivo**, com os mesmos filtros do bot de Discord: desconto mínimo, nota de avaliação mínima, exclusão de jogos indie, e preço mínimo histórico (via IsThereAnyDeal). Preços em R$, tudo em português.

---

## O que tem aqui

- `server.js` — pequeno servidor (Node.js + Express) que busca e filtra as promoções
- `public/index.html` — a página
- `public/style.css` — o visual
- `public/app.js` — o que roda no navegador, chama o servidor e monta os cards

Por que precisa de servidor? A API da Steam bloqueia chamadas feitas direto do navegador (CORS). O servidor faz a busca "por trás" e entrega pronto pro site.

---

## Rodando no seu computador

**1.** Instale o [Node.js](https://nodejs.org) (versão 18 ou mais recente)

**2.** Instale as dependências:
```bash
npm install
```

**3.** (Opcional) Configure a chave do IsThereAnyDeal pra ver o preço mínimo histórico:
```bash
export ITAD_API_KEY=sua_chave_aqui
```
No Windows (PowerShell): `$env:ITAD_API_KEY="sua_chave_aqui"`

**4.** Rode o servidor:
```bash
npm start
```

**5.** Abra **http://localhost:3000** no navegador

---

## Colocando no ar de graça

O site é bem leve — dá pra hospedar de graça em qualquer plataforma que rode Node.js. Sugestão: **Render.com** (mesma lógica do bot, só que agora é um "Web Service" em vez de um "Background Worker").

### Passo a passo (Render.com)

**1.** Suba esses arquivos num repositório novo no GitHub (mesma forma que fez com o bot)

**2.** Acesse **render.com** → faça login com GitHub

**3.** Clique em **"New +"** → **"Web Service"**

**4.** Selecione o repositório do site

**5.** Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

**6.** Em **"Environment Variables"**, adicione (se quiser o preço histórico):
   - `ITAD_API_KEY` → sua chave

**7.** Clique em **"Create Web Service"**

Em alguns minutos o Render te dá uma URL tipo `https://seu-site.onrender.com` — é essa que você acessa e pode compartilhar.

> ⚠️ No plano gratuito do Render, o site "dorme" depois de um tempo sem uso e demora ~30s pra acordar na próxima visita. Normal para uso pessoal.

---

## Como usar

Na página:
1. Ajusta os controles de **desconto mínimo** e **nota mínima**
2. Marca ou desmarca **excluir jogos indie**
3. Clica em **"Buscar promoções"**
4. Aguarda (pode levar de 20s a 1 min, dependendo se o preço histórico está ativado)
5. Os jogos aparecem em cards, ordenados por nota de avaliação e depois desconto

---

## Sobre o preço mínimo histórico

Igual no bot: sem uma chave do **IsThereAnyDeal**, o site funciona normal, só sem esse dado extra. Pra ativar, veja como conseguir a chave gratuita no README do bot (mesmo processo, mesma chave pode ser reaproveitada aqui).

---

## Licença

Uso livre para fins pessoais. Dados via Steam Store API e IsThereAnyDeal API. A Steam é propriedade da Valve Corporation.
