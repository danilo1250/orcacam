'use strict';
/* Orçamentos – app sem servidor. Os dados ficam no navegador (localStorage).
   Valores em dinheiro são guardados em centavos (inteiros) para a soma ser exata. */

const KEY = 'orcamentos-cftv-v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- números ---------- */
const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dec = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQtd = q => Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
function parseNum(s) {
  s = String(s ?? '').replace(/[^\d,.]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
const parseCents = s => Math.round(parseNum(s) * 100);

/* ---------- datas ---------- */
const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dataBR = iso => { const [a, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${a}` : ''; };
function somaDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d + (Number(dias) || 0));
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

/* ---------- estado ---------- */
const padrao = () => ({
  empresa: { nome: '', cnpj: '', telefone: '', email: '', endereco: '', logo: '', validadeDias: 15, pagamentoPadrao: '', obsPadrao: '' },
  produtos: [], orcamentos: [], proximoNumero: 1,
});
let state = carregar();
let view = 'lista';
let editId = null;
let memoriaOk = true;

function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d === 'object') return normalizar(d);
  } catch (e) { /* começa vazio */ }
  return padrao();
}
function normalizar(d) {
  const p = padrao();
  return {
    empresa: { ...p.empresa, ...(d.empresa || {}) },
    produtos: Array.isArray(d.produtos) ? d.produtos : [],
    orcamentos: Array.isArray(d.orcamentos) ? d.orcamentos : [],
    proximoNumero: Number(d.proximoNumero) || 1,
  };
}
function salvar() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); memoriaOk = true; }
  catch (e) { if (memoriaOk) toast('Não foi possível salvar neste navegador. Faça um backup em "Minha empresa".'); memoriaOk = false; }
}

/* ---------- cálculo ---------- */
const totalItem = it => Math.round((Number(it.qtd) || 0) * (Number(it.preco) || 0));
function totais(o) {
  const subtotal = o.itens.reduce((s, it) => s + totalItem(it), 0);
  let desconto = o.descontoTipo === 'pct' ? Math.round(subtotal * (Number(o.desconto) || 0) / 100) : (Number(o.desconto) || 0);
  desconto = Math.min(Math.max(desconto, 0), subtotal);
  return { subtotal, desconto, total: subtotal - desconto };
}
const numFmt = n => String(n).padStart(4, '0');
const orcAtual = () => state.orcamentos.find(o => o.id === editId);

/* ---------- navegação ---------- */
function ir(v, id = null) {
  if (view === 'editor' && v !== 'editor') limparVazio();
  view = v; editId = id; render(); window.scrollTo(0, 0);
}
function limparVazio() {
  const o = orcAtual();
  if (o && !o.itens.length && !o.cliente.nome.trim()) {
    state.orcamentos = state.orcamentos.filter(x => x !== o);
    if (o.numero === state.proximoNumero - 1) state.proximoNumero--;
    salvar();
  }
}
function render() {
  document.querySelectorAll('#abas button').forEach(b => b.classList.toggle('ativa', b.dataset.view === (view === 'editor' ? 'lista' : view)));
  const m = $('#main');
  m.innerHTML = ({ lista: vLista, editor: vEditor, produtos: vProdutos, empresa: vEmpresa })[view]();
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- tela: lista de orçamentos ---------- */
let buscaOrc = '';
function vLista() {
  const q = buscaOrc.trim().toLowerCase();
  const lista = state.orcamentos.slice().sort((a, b) => b.numero - a.numero)
    .filter(o => !q || o.cliente.nome.toLowerCase().includes(q) || numFmt(o.numero).includes(q));
  let corpo;
  if (!state.orcamentos.length) {
    corpo = `<div class="card vazio"><p><b>Nenhum orçamento ainda.</b></p>
      <p class="muted">${state.produtos.length ? 'Toque em "Novo orçamento" para começar.' : 'Comece cadastrando seus produtos na aba "Produtos". Depois é só criar o orçamento e escolher as quantidades.'}</p>
      ${state.produtos.length ? '' : '<button class="btn sec" data-view="produtos">Cadastrar produtos</button>'}</div>`;
  } else {
    corpo = `<input type="search" id="buscaOrc" placeholder="Buscar por cliente ou número…" value="${esc(buscaOrc)}">
    <div class="card" id="listaOrc">${linhasOrc(lista)}</div>`;
  }
  return `<div class="cab"><h1>Orçamentos</h1><button class="btn" data-acao="novo">+ Novo orçamento</button></div>${corpo}`;
}
function linhasOrc(lista) {
  if (!lista.length) return '<p class="muted">Nenhum orçamento encontrado.</p>';
  return lista.map(o => `<div class="linha">
    <div class="info"><b>Nº ${numFmt(o.numero)} · ${esc(o.cliente.nome || 'Cliente sem nome')}</b>
      <span class="muted small">${dataBR(o.data)} · ${o.itens.length} ${o.itens.length === 1 ? 'item' : 'itens'}</span></div>
    <div class="preco num">${brl(totais(o).total)}</div>
    <div class="acoes">
      <button class="btn mini" data-acao="abrir" data-id="${o.id}">Abrir</button>
      <button class="btn mini sec" data-acao="pdf" data-id="${o.id}">PDF</button>
      <button class="btn mini sec" data-acao="duplicar" data-id="${o.id}">Duplicar</button>
      <button class="btn mini perigo" data-acao="excluirOrc" data-id="${o.id}">Excluir</button>
    </div></div>`).join('');
}
function novoOrcamento() {
  const e = state.empresa;
  const o = {
    id: uid(), numero: state.proximoNumero++, data: hojeISO(), validadeDias: Number(e.validadeDias) || 15,
    cliente: { nome: '', doc: '', telefone: '', email: '', endereco: '' },
    itens: [], descontoTipo: 'valor', desconto: 0, pagamento: e.pagamentoPadrao || '', obs: e.obsPadrao || '',
  };
  state.orcamentos.push(o); salvar(); ir('editor', o.id);
}

/* ---------- tela: editor ---------- */
function vEditor() {
  const o = orcAtual();
  if (!o) { view = 'lista'; return vLista(); }
  const t = totais(o), c = o.cliente;
  const podeEnviar = !!navigator.canShare && !naClaude();
  return `<div class="cab"><h1>Orçamento Nº ${numFmt(o.numero)}</h1><button class="btn sec mini" data-view="lista">← Voltar</button></div>
  <div class="card"><h3>Cliente</h3>
    <label>Nome do cliente<input data-f="cliente.nome" value="${esc(c.nome)}" placeholder="Nome ou empresa" autocomplete="off"></label>
    <div class="duas quebra">
      <label>Telefone / WhatsApp<input data-f="cliente.telefone" value="${esc(c.telefone)}" inputmode="tel" autocomplete="off"></label>
      <label>CPF / CNPJ (opcional)<input data-f="cliente.doc" value="${esc(c.doc)}" autocomplete="off"></label>
    </div>
    <label>Endereço da instalação (opcional)<input data-f="cliente.endereco" value="${esc(c.endereco)}" autocomplete="off"></label>
    <div class="duas">
      <label>Data<input type="date" data-f="data" value="${esc(o.data)}"></label>
      <label>Validade (dias)<input data-f="validadeDias" inputmode="numeric" value="${esc(o.validadeDias)}"></label>
    </div>
  </div>
  <div class="card"><div class="cab"><h3>Produtos e serviços</h3>
      <div class="acoes" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn mini" data-acao="picker">+ Adicionar produto</button>
        <button class="btn mini sec" data-acao="avulso">+ Item avulso</button>
      </div></div>
    <div id="itens">${itensHTML(o)}</div>
  </div>
  <div class="card resumo">
    <div class="r"><span>Subtotal</span><span class="num" id="rSub">${brl(t.subtotal)}</span></div>
    <div class="r"><span>Desconto</span><span class="desc-in">
      <input id="descVal" inputmode="decimal" value="${o.descontoTipo === 'pct' ? fmtQtd(o.desconto) : dec(o.desconto)}" aria-label="Desconto">
      <select id="descTipo" aria-label="Tipo de desconto"><option value="valor"${o.descontoTipo === 'valor' ? ' selected' : ''}>R$</option><option value="pct"${o.descontoTipo === 'pct' ? ' selected' : ''}>%</option></select></span></div>
    <div class="r muted small" id="rDescLinha"${o.descontoTipo === 'pct' && t.desconto ? '' : ' hidden'}><span></span><span class="num" id="rDesc">− ${brl(t.desconto)}</span></div>
    <div class="r total"><span>Total</span><span class="num" id="rTot">${brl(t.total)}</span></div>
  </div>
  <div class="card"><h3>Condições</h3>
    <label>Forma de pagamento<input data-f="pagamento" value="${esc(o.pagamento)}" placeholder="Ex.: 50% de entrada e 50% na entrega, Pix ou cartão"></label>
    <label>Observações<textarea data-f="obs" placeholder="Ex.: Garantia de 1 ano. Prazo de instalação: 3 dias úteis.">${esc(o.obs)}</textarea></label>
  </div>
  <p class="muted small">Tudo é salvo automaticamente enquanto você preenche.</p>
  <div class="barra"><div class="barra-in">
    <div class="tot"><span class="muted small">Total</span><b class="num" id="bTot">${brl(t.total)}</b></div>
    <div class="acoes">
      <button class="btn sec" data-acao="pdf" data-id="${o.id}">Baixar PDF</button>
      ${podeEnviar ? `<button class="btn" data-acao="enviar" data-id="${o.id}">Enviar PDF</button>` : ''}
    </div></div></div>`;
}
function itensHTML(o) {
  if (!o.itens.length) return '<p class="muted">Nenhum item ainda. Toque em "Adicionar produto" para escolher do seu cadastro.</p>';
  return o.itens.map((it, i) => `<div class="item" data-i="${i}">
    <div class="item-top"><input data-k="nome" value="${esc(it.nome)}" placeholder="Nome do item" aria-label="Nome do item">
      <button class="xbtn" data-acao="remItem" title="Remover item" aria-label="Remover item">×</button></div>
    <input class="item-desc" data-k="descricao" value="${esc(it.descricao)}" placeholder="Descrição (opcional)" aria-label="Descrição">
    <div class="item-nums">
      <label>Qtd (${esc(it.unidade || 'un')})<span class="stepper">
        <button data-acao="menos" aria-label="Diminuir">−</button>
        <input data-k="qtd" inputmode="decimal" value="${fmtQtd(it.qtd)}" aria-label="Quantidade">
        <button data-acao="mais" aria-label="Aumentar">+</button></span></label>
      <label>Preço (R$)<input data-k="preco" inputmode="decimal" value="${dec(it.preco)}"></label>
      <div class="item-total num" data-tot>${brl(totalItem(it))}</div>
    </div></div>`).join('');
}
function atualizaTotais() {
  const o = orcAtual(); if (!o) return;
  const t = totais(o);
  $('#rSub').textContent = brl(t.subtotal);
  $('#rTot').textContent = $('#bTot').textContent = brl(t.total);
  $('#rDesc').textContent = '− ' + brl(t.desconto);
  $('#rDescLinha').hidden = !(o.descontoTipo === 'pct' && t.desconto);
}
function redesenhaItens() { const o = orcAtual(); $('#itens').innerHTML = itensHTML(o); atualizaTotais(); salvar(); }

/* seletor de produtos */
function abrirPicker() {
  if (!state.produtos.length) { toast('Cadastre seus produtos na aba "Produtos" primeiro, ou use "Item avulso".'); return; }
  $('#pickBusca').value = ''; desenhaPicker(); $('#dlgPicker').showModal();
}
function desenhaPicker() {
  const o = orcAtual(); const q = $('#pickBusca').value.trim().toLowerCase();
  const lista = state.produtos.filter(p => !q || (p.nome + ' ' + p.descricao).toLowerCase().includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#pickLista').innerHTML = lista.length ? lista.map(p => {
    const it = o.itens.find(x => x.produtoId === p.id);
    return `<div class="pick"><div class="info"><b>${esc(p.nome)}</b>
      <span class="muted small num">${brl(p.preco)} / ${esc(p.unidade)}</span>
      ${it ? ` <span class="badge">${fmtQtd(it.qtd)} no orçamento</span>` : ''}</div>
      <button class="btn mini" data-acao="pick" data-id="${p.id}">+ Adicionar</button></div>`;
  }).join('') : '<p class="muted">Nenhum produto encontrado.</p>';
}
function pick(id) {
  const o = orcAtual(), p = state.produtos.find(x => x.id === id); if (!o || !p) return;
  const it = o.itens.find(x => x.produtoId === id);
  if (it) it.qtd = (Number(it.qtd) || 0) + 1;
  else o.itens.push({ produtoId: p.id, nome: p.nome, descricao: p.descricao || '', unidade: p.unidade || 'un', qtd: 1, preco: p.preco });
  desenhaPicker(); redesenhaItens();
}

/* ---------- tela: produtos ---------- */
let buscaProd = '';
function vProdutos() {
  let corpo;
  if (!state.produtos.length) {
    corpo = `<div class="card vazio"><p><b>Nenhum produto cadastrado.</b></p>
      <p class="muted">Cadastre câmeras, DVRs, cabos, conectores e a mão de obra. Depois é só escolher no orçamento.</p>
      <button class="btn sec" data-acao="exemplos">Carregar produtos de exemplo</button>
      <p class="muted small">Os exemplos vêm com preços fictícios. Ajuste para os seus.</p></div>`;
  } else {
    corpo = `<input type="search" id="buscaProd" placeholder="Buscar produto…" value="${esc(buscaProd)}">
      <div class="card" id="listaProd">${linhasProd()}</div>`;
  }
  return `<div class="cab"><h1>Produtos</h1><div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn sec" data-acao="abrirImportar">Importar por link</button>
    <button class="btn" data-acao="novoProd">+ Novo produto</button></div></div>${corpo}`;
}
function linhasProd() {
  const q = buscaProd.trim().toLowerCase();
  const lista = state.produtos.filter(p => !q || (p.nome + ' ' + p.descricao).toLowerCase().includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!lista.length) return '<p class="muted">Nenhum produto encontrado.</p>';
  return lista.map(p => `<div class="linha">
    <div class="info"><b>${esc(p.nome)}</b>${p.descricao ? `<span class="muted small">${esc(p.descricao)}</span>` : ''}</div>
    <div class="preco num">${brl(p.preco)} <span class="muted small">/ ${esc(p.unidade)}</span></div>
    <div class="acoes">${linkOk(p.link) ? `<a class="btn mini sec" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">Ver anúncio</a>` : ''}
      <button class="btn mini sec" data-acao="editProd" data-id="${p.id}">Editar</button>
      <button class="btn mini perigo" data-acao="excluirProd" data-id="${p.id}">Excluir</button></div></div>`).join('');
}
let prodEditId = null;
const linkOk = u => /^https?:\/\/\S+$/i.test(String(u || ''));
function abrirProduto(id, pre) {
  prodEditId = id || null;
  const p = state.produtos.find(x => x.id === id) || pre;
  $('#dlgProdutoTitulo').textContent = id ? 'Editar produto' : 'Novo produto';
  $('#pNome').value = p ? p.nome : ''; $('#pDesc').value = p ? p.descricao : '';
  $('#pUn').value = p ? p.unidade : 'un'; $('#pPreco').value = p && p.preco ? dec(p.preco) : ''; $('#pLink').value = p ? p.link || '' : '';
  $('#dlgProduto').showModal(); (pre && pre.nome && !pre.preco ? $('#pPreco') : $('#pNome')).focus();
}
function salvarProduto() {
  const dados = { nome: $('#pNome').value.trim(), descricao: $('#pDesc').value.trim(), unidade: $('#pUn').value, preco: parseCents($('#pPreco').value), link: linkOk($('#pLink').value.trim()) ? $('#pLink').value.trim() : '' };
  if (!dados.nome) return;
  const p = state.produtos.find(x => x.id === prodEditId);
  if (p) Object.assign(p, dados); else state.produtos.push({ id: uid(), ...dados });
  salvar(); render(); toast('Produto salvo');
}
/* importar por link: lê o nome no próprio endereço do anúncio e o preço no texto colado.
   Não acessa o site da loja (o navegador não permite e as lojas bloqueiam leitura automática). */
const ACENTOS = { camera: 'câmera', cameras: 'câmeras', seguranca: 'segurança', visao: 'visão', gravacao: 'gravação', instalacao: 'instalação', protecao: 'proteção', conexao: 'conexão', resolucao: 'resolução', inteligente: 'inteligente', video: 'vídeo', audio: 'áudio', memoria: 'memória', cartao: 'cartão', sensor: 'sensor', alimentacao: 'alimentação', eletrica: 'elétrica', eletrico: 'elétrico', metalica: 'metálica', plastico: 'plástico', lampada: 'lâmpada', hibrido: 'híbrido', hibrida: 'híbrida', bateria: 'bateria', movel: 'móvel', deteccao: 'detecção', presenca: 'presença', externa: 'externa', canais: 'canais' };
function nomeDoLink(url) {
  let u; try { u = new URL(url); } catch (e) { return ''; }
  const segs = u.pathname.split('/').map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } })
    .map(s => s.replace(/\.(html?|php|aspx?)$/i, '').replace(/^ML[A-Z]-?\d+-?/i, '').replace(/-?_JM$/i, '').replace(/[-_]?\d{6,}$/, ''))
    .filter(s => /[a-zA-ZÀ-ÿ]{3}/.test(s) && /[-_ +]/.test(s) && !/^ML[A-Z]U?\d+$/i.test(s));
  if (!segs.length) return '';
  const melhor = segs.sort((a, b) => b.length - a.length)[0];
  const palavras = melhor.split(/[-_+ ]+/).filter(Boolean).map(w => ACENTOS[w.toLowerCase()] || w);
  const nome = palavras.join(' ').trim();
  return nome ? nome[0].toUpperCase() + nome.slice(1) : '';
}
function lerImportacao(texto) {
  texto = String(texto || '').trim();
  const link = (texto.match(/https?:\/\/[^\s<>"]+/i) || [''])[0];
  const resto = texto.replace(link, ' ');
  const mp = resto.match(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/);
  const preco = mp ? parseCents(mp[1]) : 0;
  const linhas = resto.split(/\n+/).map(l => l.replace(/R\$\s*[\d.,]+/g, '').trim()).filter(l => l.length >= 6 && /[a-zA-ZÀ-ÿ]{3}/.test(l));
  const nome = (linhas.sort((a, b) => b.length - a.length)[0] || nomeDoLink(link)).slice(0, 120);
  return { nome, preco, link, descricao: '', unidade: 'un' };
}
function importar() {
  const d = lerImportacao($('#impTexto').value);
  if (!d.link && !d.nome) { toast('Cole o link do anúncio para continuar.'); return; }
  $('#dlgImportar').close(); abrirProduto(null, d);
  toast(!d.nome ? 'Não achei o nome nesse link. Preencha o nome e o preço.' : d.preco ? 'Confira o nome e o preço e salve.' : 'Nome reconhecido. Agora informe o preço.');
}
const EXEMPLOS = [
  ['Câmera Bullet Full HD 1080p', 'Infravermelho 20 m, uso externo', 'un', 18900],
  ['Câmera Dome Full HD 1080p', 'Infravermelho 20 m, uso interno', 'un', 16900],
  ['DVR 4 canais Full HD', 'Acesso pelo celular', 'un', 45900],
  ['DVR 8 canais Full HD', 'Acesso pelo celular', 'un', 64900],
  ['HD 1 TB para CFTV', 'Próprio para gravação contínua', 'un', 38900],
  ['Cabo coaxial 4 mm bipolar', '', 'm', 250],
  ['Conector BNC com borne', '', 'un', 450],
  ['Conector P4 macho', '', 'un', 350],
  ['Fonte 12 V 5 A', '', 'un', 5900],
  ['Caixa de proteção para conexões', '', 'un', 990],
  ['Instalação e configuração por câmera', 'Mão de obra', 'serv', 12000],
];

/* ---------- tela: empresa ---------- */
function vEmpresa() {
  const e = state.empresa;
  return `<div class="cab"><h1>Minha empresa</h1></div>
  <div class="card"><h3>Dados que aparecem no PDF</h3>
    <label>Nome da empresa<input data-e="nome" value="${esc(e.nome)}" placeholder="Ex.: Segurança Total CFTV"></label>
    <div class="duas quebra">
      <label>CNPJ / CPF<input data-e="cnpj" value="${esc(e.cnpj)}"></label>
      <label>Telefone / WhatsApp<input data-e="telefone" value="${esc(e.telefone)}" inputmode="tel"></label>
    </div>
    <label>E-mail<input data-e="email" value="${esc(e.email)}" inputmode="email"></label>
    <label>Endereço<input data-e="endereco" value="${esc(e.endereco)}"></label>
    <div><span class="small muted" style="font-weight:600">Logo (opcional)</span>
      <div class="logo-box">${e.logo ? `<img src="${e.logo}" alt="Logo da empresa">` : ''}
        <input type="file" id="logoArq" accept="image/png,image/jpeg" hidden>
        <button class="btn mini sec" data-acao="logo">${e.logo ? 'Trocar logo' : 'Escolher imagem'}</button>
        ${e.logo ? '<button class="btn mini perigo" data-acao="remLogo">Remover</button>' : ''}</div></div>
  </div>
  <div class="card"><h3>Padrões para novos orçamentos</h3>
    <label>Validade (dias)<input data-e="validadeDias" inputmode="numeric" value="${esc(e.validadeDias)}" style="max-width:120px"></label>
    <label>Forma de pagamento<input data-e="pagamentoPadrao" value="${esc(e.pagamentoPadrao)}" placeholder="Ex.: Pix, dinheiro ou cartão em até 3x"></label>
    <label>Observações<textarea data-e="obsPadrao" placeholder="Ex.: Garantia de 1 ano para equipamentos e 90 dias para a instalação.">${esc(e.obsPadrao)}</textarea></label>
  </div>
  <div class="card"><h3>Backup</h3>
    <p class="muted small">Os dados ficam guardados só neste aparelho e neste navegador. Salve um backup de vez em quando, e use-o para passar tudo para outro aparelho.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn sec" data-acao="backup">Salvar backup</button>
      <button class="btn sec" data-acao="restaurar">Restaurar backup</button>
      <input type="file" id="backupArq" accept="application/json,.json" hidden></div>
  </div>`;
}
function lerLogo(file) {
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 500 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      state.empresa.logo = cv.toDataURL('image/png'); salvar(); render(); toast('Logo salva');
    };
    img.onerror = () => toast('Não foi possível ler essa imagem. Use PNG ou JPG.');
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
function baixar(blob, nome) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const naClaude = () => !!(window.claude && window.claude.use);
async function salvarArquivo(blob, nome) {
  if (naClaude()) { // dentro do Claude a página não baixa sozinha: pede ao visualizador
    const d = await window.claude.use('downloads');
    if (!d) { toast('Não é possível salvar arquivos nesta tela.'); return false; }
    try { await d.save({ filename: nome, data: blob }); return true; }
    catch (e) { if (!e || e.code !== 'declined') toast('Não foi possível salvar o arquivo.'); return false; }
  }
  baixar(blob, nome); return true;
}
function confirmar(msg, rotulo) {
  return new Promise(res => {
    const d = $('#dlgConfirma');
    $('#confMsg').textContent = msg; $('#confOk').textContent = rotulo || 'Excluir';
    d.returnValue = ''; d.showModal();
    d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
  });
}

/* ---------- PDF ---------- */
const nomeArquivo = o => `Orcamento-${numFmt(o.numero)}${o.cliente.nome.trim() ? '-' + o.cliente.nome.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) : ''}.pdf`;

function gerarPDF(o) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 14, R = W - M;
  const e = state.empresa, c = o.cliente, t = totais(o);
  const AZUL = [20, 50, 79], CINZA = [95, 105, 120];

  // cabeçalho: empresa à esquerda, número/data à direita
  let x = M, yLogo = M;
  if (e.logo) {
    try {
      const p = doc.getImageProperties(e.logo);
      let h = 22, w = h * p.width / p.height;
      if (w > 46) { w = 46; h = w * p.height / p.width; }
      doc.addImage(e.logo, p.fileType, M, M, w, h); x = M + w + 5; yLogo = M + h;
    } catch (err) { /* segue sem logo */ }
  }
  const larg = R - 52 - x;
  let y = M + 5;
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...AZUL);
  const nomeL = doc.splitTextToSize(e.nome || 'Orçamento', larg);
  doc.text(nomeL, x, y); y += nomeL.length * 5.6;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...CINZA);
  const info = [e.cnpj && 'CNPJ/CPF: ' + e.cnpj, [e.telefone, e.email].filter(Boolean).join('  |  '), e.endereco].filter(Boolean);
  info.forEach(l => { const ls = doc.splitTextToSize(l, larg); doc.text(ls, x, y); y += ls.length * 4.2; });

  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...AZUL);
  doc.text('ORÇAMENTO', R, M + 6, { align: 'right' });
  doc.setFontSize(11).setTextColor(30);
  doc.text('Nº ' + numFmt(o.numero), R, M + 12.5, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...CINZA);
  doc.text('Data: ' + dataBR(o.data), R, M + 18, { align: 'right' });
  if (Number(o.validadeDias) > 0) doc.text('Válido até: ' + somaDias(o.data, o.validadeDias), R, M + 22.5, { align: 'right' });

  y = Math.max(y, yLogo, M + 24) + 3;
  doc.setDrawColor(...AZUL).setLineWidth(0.6).line(M, y, R, y); y += 7;

  // cliente
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...CINZA).text('CLIENTE', M, y); y += 5;
  doc.setFontSize(11).setTextColor(30).text(doc.splitTextToSize(c.nome || '—', R - M), M, y); y += 5;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60);
  [[c.doc && 'CPF/CNPJ: ' + c.doc, c.telefone && 'Tel.: ' + c.telefone].filter(Boolean).join('   |   '), c.endereco && 'Endereço: ' + c.endereco]
    .filter(Boolean).forEach(l => { const ls = doc.splitTextToSize(l, R - M); doc.text(ls, M, y); y += ls.length * 4.3; });
  y += 3;

  // tabela de itens
  doc.autoTable({
    startY: y, margin: { left: M, right: M, bottom: 18 },
    head: [['#', 'Descrição', 'Qtd', 'Un.', 'Valor unit.', 'Total']],
    body: o.itens.map((it, i) => [i + 1, it.nome + (it.descricao ? '\n' + it.descricao : ''), fmtQtd(it.qtd), it.unidade || 'un', brl(it.preco), brl(totalItem(it))]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.2, textColor: 30, lineColor: [205, 212, 222], lineWidth: 0.2, valign: 'middle' },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', lineColor: AZUL },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 14, halign: 'center' }, 4: { cellWidth: 29, halign: 'right' }, 5: { cellWidth: 31, halign: 'right' } },
    didParseCell: d => { if (d.section === 'head' && d.column.index >= 4) d.cell.styles.halign = 'right'; if (d.section === 'head' && (d.column.index === 0 || d.column.index === 2 || d.column.index === 3)) d.cell.styles.halign = 'center'; },
  });
  y = doc.lastAutoTable.finalY + 6;
  const cabe = h => { if (y + h > H - 20) { doc.addPage(); y = M + 4; } };

  // totais
  cabe(26);
  const xl = R - 70;
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(60);
  if (t.desconto > 0) {
    doc.text('Subtotal', xl, y); doc.text(brl(t.subtotal), R, y, { align: 'right' }); y += 5.5;
    doc.text('Desconto' + (o.descontoTipo === 'pct' ? ` (${fmtQtd(o.desconto)}%)` : ''), xl, y); doc.text('- ' + brl(t.desconto), R, y, { align: 'right' }); y += 4;
  }
  doc.setFillColor(...AZUL).rect(xl - 3, y, R - xl + 3, 10, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(255);
  doc.text('TOTAL', xl, y + 6.7); doc.text(brl(t.total), R - 2.5, y + 6.7, { align: 'right' });
  y += 18;

  // condições
  const bloco = (titulo, texto) => {
    if (!String(texto || '').trim()) return;
    doc.setFont('helvetica', 'normal').setFontSize(9.5);
    const ls = doc.splitTextToSize(String(texto).trim(), R - M);
    cabe(6 + Math.min(ls.length, 4) * 4.5);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...CINZA).text(titulo, M, y); y += 4.8;
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(30);
    ls.forEach(l => { if (y > H - 20) { doc.addPage(); y = M + 4; } doc.text(l, M, y); y += 4.5; });
    y += 4;
  };
  bloco('FORMA DE PAGAMENTO', o.pagamento);
  bloco('OBSERVAÇÕES', o.obs);

  // assinaturas
  cabe(30); y += 16;
  doc.setDrawColor(120).setLineWidth(0.2);
  doc.line(M, y, M + 78, y); doc.line(R - 78, y, R, y);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...CINZA);
  doc.text(e.nome || 'Responsável', M + 39, y + 4.5, { align: 'center', maxWidth: 78 });
  doc.text(c.nome || 'Cliente', R - 39, y + 4.5, { align: 'center', maxWidth: 78 });

  // rodapé
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(140);
    doc.text(`Orçamento Nº ${numFmt(o.numero)}`, M, H - 9);
    doc.text(`Página ${i} de ${n}`, R, H - 9, { align: 'right' });
  }
  return doc;
}
function checaPDF(o) {
  if (!o) return false;
  if (!o.itens.length) { toast('Adicione pelo menos um item antes de gerar o PDF.'); return false; }
  if (!window.jspdf) { toast('O gerador de PDF não carregou. Recarregue a página.'); return false; }
  return true;
}
async function baixarPDF(o) { if (!checaPDF(o)) return; if (await salvarArquivo(gerarPDF(o).output('blob'), nomeArquivo(o))) toast('PDF gerado'); }
async function enviarPDF(o) {
  if (!checaPDF(o)) return;
  const doc = gerarPDF(o), nome = nomeArquivo(o);
  const file = new File([doc.output('blob')], nome, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Orçamento Nº ${numFmt(o.numero)}` }); }
    catch (err) { if (err.name !== 'AbortError' && await salvarArquivo(file, nome)) toast('PDF baixado. Anexe na conversa com o cliente.'); }
  } else if (await salvarArquivo(file, nome)) toast('PDF baixado. Anexe na conversa com o cliente.');
}

/* ---------- eventos ---------- */
document.addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.dataset.view) return ir(b.dataset.view);
  if ('fechar' in b.dataset) return b.closest('dialog').close();
  const a = b.dataset.acao, id = b.dataset.id; if (!a) return;
  const o = orcAtual();
  const idx = () => Number(b.closest('.item').dataset.i);
  switch (a) {
    case 'novo': novoOrcamento(); break;
    case 'abrir': ir('editor', id); break;
    case 'pdf': baixarPDF(state.orcamentos.find(x => x.id === id)); break;
    case 'enviar': enviarPDF(state.orcamentos.find(x => x.id === id)); break;
    case 'duplicar': {
      const src = state.orcamentos.find(x => x.id === id); if (!src) break;
      const cp = JSON.parse(JSON.stringify(src));
      cp.id = uid(); cp.numero = state.proximoNumero++; cp.data = hojeISO();
      state.orcamentos.push(cp); salvar(); ir('editor', cp.id); toast('Orçamento duplicado'); break;
    }
    case 'excluirOrc': {
      const x = state.orcamentos.find(q => q.id === id);
      if (x) confirmar(`Excluir o orçamento Nº ${numFmt(x.numero)}${x.cliente.nome ? ' de ' + x.cliente.nome : ''}?`).then(ok => {
        if (ok) { state.orcamentos = state.orcamentos.filter(q => q !== x); salvar(); render(); } });
      break;
    }
    case 'picker': abrirPicker(); break;
    case 'pick': pick(id); break;
    case 'avulso': o.itens.push({ produtoId: null, nome: '', descricao: '', unidade: 'un', qtd: 1, preco: 0 }); redesenhaItens();
      { const ins = document.querySelectorAll('#itens [data-k="nome"]'); ins[ins.length - 1].focus(); } break;
    case 'remItem': o.itens.splice(idx(), 1); redesenhaItens(); break;
    case 'mais': case 'menos': {
      const it = o.itens[idx()];
      it.qtd = Math.max(0, Math.round(((Number(it.qtd) || 0) + (a === 'mais' ? 1 : -1)) * 1000) / 1000);
      const row = b.closest('.item');
      $('[data-k="qtd"]', row).value = fmtQtd(it.qtd); $('[data-tot]', row).textContent = brl(totalItem(it));
      atualizaTotais(); salvar(); break;
    }
    case 'novoProd': abrirProduto(); break;
    case 'abrirImportar': $('#impTexto').value = ''; $('#dlgImportar').showModal(); $('#impTexto').focus(); break;
    case 'importar': importar(); break;
    case 'editProd': abrirProduto(id); break;
    case 'excluirProd': {
      const p = state.produtos.find(x => x.id === id);
      if (p) confirmar(`Excluir o produto "${p.nome}"? Os orçamentos já feitos não mudam.`).then(ok => {
        if (ok) { state.produtos = state.produtos.filter(x => x !== p); salvar(); render(); } });
      break;
    }
    case 'exemplos': EXEMPLOS.forEach(([nome, descricao, unidade, preco]) => state.produtos.push({ id: uid(), nome, descricao, unidade, preco }));
      salvar(); render(); toast('Exemplos carregados. Ajuste os preços.'); break;
    case 'logo': $('#logoArq').click(); break;
    case 'remLogo': state.empresa.logo = ''; salvar(); render(); break;
    case 'backup': salvarArquivo(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), `backup-orcamentos-${hojeISO()}.json`); break;
    case 'restaurar': $('#backupArq').click(); break;
  }
});

document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.id === 'buscaOrc') {
    buscaOrc = el.value; const q = buscaOrc.trim().toLowerCase();
    $('#listaOrc').innerHTML = linhasOrc(state.orcamentos.slice().sort((a, b) => b.numero - a.numero)
      .filter(o => !q || o.cliente.nome.toLowerCase().includes(q) || numFmt(o.numero).includes(q))); return;
  }
  if (el.id === 'buscaProd') { buscaProd = el.value; $('#listaProd').innerHTML = linhasProd(); return; }
  if (el.id === 'pickBusca') return desenhaPicker();
  if (el.dataset.e) {
    state.empresa[el.dataset.e] = el.dataset.e === 'validadeDias' ? Math.round(parseNum(el.value)) : el.value;
    return salvar();
  }
  const o = orcAtual(); if (!o || view !== 'editor') return;
  if (el.dataset.f) {
    const f = el.dataset.f;
    if (f.startsWith('cliente.')) o.cliente[f.slice(8)] = el.value;
    else if (f === 'validadeDias') o.validadeDias = Math.round(parseNum(el.value));
    else if (f === 'data') o.data = el.value || hojeISO();
    else o[f] = el.value;
    return salvar();
  }
  if (el.dataset.k) {
    const row = el.closest('.item'), it = o.itens[Number(row.dataset.i)], k = el.dataset.k;
    if (k === 'qtd') it.qtd = parseNum(el.value);
    else if (k === 'preco') it.preco = parseCents(el.value);
    else it[k] = el.value;
    $('[data-tot]', row).textContent = brl(totalItem(it));
    atualizaTotais(); return salvar();
  }
  if (el.id === 'descVal') { o.desconto = o.descontoTipo === 'pct' ? Math.min(100, parseNum(el.value)) : parseCents(el.value); atualizaTotais(); salvar(); }
});

document.addEventListener('change', ev => {
  const el = ev.target, o = orcAtual();
  if (el.id === 'descTipo' && o) { o.descontoTipo = el.value; o.desconto = 0; $('#descVal').value = el.value === 'pct' ? '0' : '0,00'; atualizaTotais(); salvar(); return; }
  if (el.id === 'descVal' && o) { el.value = o.descontoTipo === 'pct' ? fmtQtd(o.desconto) : dec(o.desconto); return; }
  if (el.dataset.k === 'preco' && o) { el.value = dec(o.itens[Number(el.closest('.item').dataset.i)].preco); return; }
  if (el.dataset.k === 'qtd' && o) { el.value = fmtQtd(o.itens[Number(el.closest('.item').dataset.i)].qtd); return; }
  if (el.id === 'logoArq' && el.files[0]) return lerLogo(el.files[0]);
  if (el.id === 'backupArq' && el.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.produtos) || !Array.isArray(d.orcamentos)) throw new Error('formato');
        confirmar(`Restaurar este backup? Ele tem ${d.produtos.length} produtos e ${d.orcamentos.length} orçamentos e vai substituir os dados atuais.`, 'Restaurar')
          .then(ok => { if (ok) { state = normalizar(d); salvar(); render(); toast('Backup restaurado'); } });
      } catch (err) { toast('Esse arquivo não é um backup válido deste aplicativo.'); }
    };
    r.readAsText(el.files[0]); el.value = '';
  }
});

$('#formProduto').addEventListener('submit', salvarProduto);
$('#pPreco').addEventListener('change', e => { e.target.value = dec(parseCents(e.target.value)); });
// selecionar o conteúdo ao focar em quantidade/preço facilita a troca do valor
document.addEventListener('focusin', ev => { const el = ev.target; if (el.matches && el.matches('[data-k="qtd"],[data-k="preco"],#descVal,#pPreco')) el.select(); });
window.addEventListener('pagehide', () => { if (view === 'editor') limparVazio(); });

// instalável no celular e utilizável sem internet (só quando hospedado em um site próprio)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !naClaude()) navigator.serviceWorker.register('sw.js').catch(() => {});

render();
