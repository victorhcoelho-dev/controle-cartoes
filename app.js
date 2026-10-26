import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/* =========================================================
   Constantes e utilitários
   ========================================================= */
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MC = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DEF_D = ["Mercado","Alimentação","Moradia","Contas da casa","Transporte","Assinaturas","Saúde","Lazer","Compras","Educação","Outros"];
const DEF_R = ["Salário","Freelance","Rendimentos","Reembolso","Vendas","Outros"];
const COLORS = ["var(--c1)","var(--c2)","var(--c3)","var(--c4)","var(--c5)","var(--c6)","var(--c7)","var(--c8)","var(--c9)","var(--c11)","var(--c12)","var(--c10)"];
const CORES = ["petroleo","roxo","laranja","grafite","vinho","azul","verde","dourado"];
const METODOS = { pix: "Pix", dinheiro: "Dinheiro", boleto: "Boleto" };
const PAGES = [
  ["painel","Painel","Visão geral do mês"],
  ["lancar","Lançar","Registre despesas e receitas"],
  ["planilha","Planilha","Todos os lançamentos, com filtros"],
  ["cartoes","Cartões","Seus cartões, faturas e limites"],
  ["ajustes","Ajustes","Categorias, dados e conta"],
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = c => brl.format((c || 0) / 100);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const CUR = TODAY.slice(0, 7);
const cents = v => Math.round((Number(v) || 0) * 100);
function addM(k, n) { let [y, m] = k.split("-").map(Number); m = m - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return `${y}-${pad(m + 1)}`; }
const mesNome = k => { const [y, m] = k.split("-").map(Number); return `${MESES[m - 1]} de ${y}`; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const mesCurto = k => { const [y, m] = k.split("-").map(Number); return `${MC[m - 1]}/${String(y).slice(2)}`; };
const fmtD = iso => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtDs = iso => { if (!iso) return "—"; const [, m, d] = iso.split("-"); return `${d}/${m}`; };
function parseValor(s) { s = String(s || "").replace(/[R$\s]/g, ""); if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const v = parseFloat(s); return isFinite(v) ? Math.round(v * 100) / 100 : NaN; }
const fmtIn = v => (Number(v) ? Number(v).toFixed(2).replace(".", ",") : "");

/* =========================================================
   Estado
   ========================================================= */
const S = {
  user: null, lanc: new Map(), config: null, loaded: false, mes: CUR, route: "painel", editId: null, kind: "despesa",
  plan: { q: "", per: "mes", de: "", ate: "", tipo: "todos", cat: "todas", pag: "todos", modo: "compras", sort: "data", dir: "desc" },
  cardEdit: null, cardMod: "credito", cardCor: "petroleo",
};
const cfg = () => S.config || { cartoes: [], catDespesa: DEF_D.slice(), catReceita: DEF_R.slice() };
const card = id => cfg().cartoes.find(c => c.id === id);
function pagLabel(p) { const c = card(p); if (c) return `${c.nome}${c.final ? " ••" + c.final : ""}`; return METODOS[p] || (p ? "Cartão removido" : "—"); }
function pagShort(p) { const c = card(p); if (c) return `${c.nome}${c.modalidade === "debito" ? " (débito)" : ""}`; return METODOS[p] || (p ? "Cartão removido" : "—"); }
function catColor(cat, kind) { const list = kind === "receita" ? cfg().catReceita : cfg().catDespesa; const i = list.indexOf(cat); return COLORS[(i < 0 ? COLORS.length - 1 : i) % COLORS.length]; }
function cardColorVar(id) { const i = cfg().cartoes.findIndex(c => c.id === id); return i < 0 ? "var(--c10)" : COLORS[(i * 2 + 6) % COLORS.length]; }

/* =========================================================
   Supabase
   ========================================================= */
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("SEU-PROJETO") && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("SUA-CHAVE");
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

async function fetchAll(table, order) {
  let out = [], from = 0; const step = 1000;
  for (;;) {
    const { data, error } = await sb.from(table).select("*").order(order, { ascending: true }).range(from, from + step - 1);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < step) break;
    from += step;
  }
  return out;
}
const mapCard = r => ({ id: r.id, nome: r.nome, final: r.final || "", modalidade: r.modalidade, cor: r.cor, limite: Number(r.limite) || 0, fechamento: r.fechamento || 0, vencimento: r.vencimento || 0 });
const mapLanc = r => ({ id: r.id, tipo: r.tipo, descricao: r.descricao, valor: Number(r.valor), data: r.data, categoria: r.categoria, pagamento: r.pagamento, parcelas: r.parcelas || 1, obs: r.obs || "", created_at: r.created_at });

async function loadAll() {
  S.loaded = false; render();
  try {
    const [cards, lancs, pref] = await Promise.all([
      fetchAll("cartoes", "created_at"),
      fetchAll("lancamentos", "data"),
      sb.from("preferencias").select("*").maybeSingle(),
    ]);
    if (pref.error) throw pref.error;
    let p = pref.data;
    if (!p) {
      const ins = await sb.from("preferencias").insert({}).select().single();
      if (ins.error) throw ins.error;
      p = ins.data;
    }
    S.config = { cartoes: cards.map(mapCard), catDespesa: p.cat_despesa || DEF_D.slice(), catReceita: p.cat_receita || DEF_R.slice() };
    S.lanc = new Map(lancs.map(r => [r.id, mapLanc(r)]));
    S.loaded = true; render();
  } catch (e) {
    console.error(e);
    S.loaded = true; render();
    toast("Não foi possível carregar seus dados. Confira a conexão e se o schema.sql foi executado.", 1);
  }
}
function fail(e, msg) { console.error(e); toast(msg || "Não foi possível salvar. Tente de novo.", 1); throw e; }

async function saveLanc(id, l) {
  const body = { tipo: l.tipo, descricao: l.descricao, valor: l.valor, data: l.data, categoria: l.categoria, pagamento: l.tipo === "despesa" ? l.pagamento : null, parcelas: l.parcelas || 1, obs: l.obs || "" };
  const q = id ? sb.from("lancamentos").update(body).eq("id", id) : sb.from("lancamentos").insert(body);
  const { data, error } = await q.select().single();
  if (error) fail(error);
  S.lanc.set(data.id, mapLanc(data)); render();
}
async function delLanc(id) {
  if (!id) return;
  const prev = S.lanc.get(id); S.lanc.delete(id); render();
  const { error } = await sb.from("lancamentos").delete().eq("id", id);
  if (error) { if (prev) S.lanc.set(id, prev); render(); fail(error, "Não foi possível excluir."); }
}
async function saveCard(id, c) {
  const q = id ? sb.from("cartoes").update(c).eq("id", id) : sb.from("cartoes").insert(c);
  const { data, error } = await q.select().single();
  if (error) fail(error, "Não foi possível salvar o cartão.");
  const conf = cfg(); const i = conf.cartoes.findIndex(x => x.id === data.id);
  if (i >= 0) conf.cartoes[i] = mapCard(data); else conf.cartoes.push(mapCard(data));
  S.config = conf; render();
}
async function delCard(id) {
  const { error } = await sb.from("cartoes").delete().eq("id", id);
  if (error) fail(error, "Não foi possível excluir o cartão.");
  S.config.cartoes = S.config.cartoes.filter(c => c.id !== id); render();
}
async function saveCats(catDespesa, catReceita) {
  const prev = { ...cfg() };
  S.config = { ...cfg(), catDespesa, catReceita }; render();
  const { error } = await sb.from("preferencias").upsert({ user_id: S.user.id, cat_despesa: catDespesa, cat_receita: catReceita, updated_at: new Date().toISOString() });
  if (error) { S.config = prev; render(); fail(error, "Não foi possível salvar as categorias."); }
}

/* =========================================================
   Login
   ========================================================= */
let authMode = "login"; // login | signup | forgot | reset
function paintAuth(msg, cls) {
  const t = { login: ["Entrar", "Acesse seu controle financeiro.", "Entrar"], signup: ["Criar conta", "Use um e-mail que você acessa.", "Criar conta"], forgot: ["Recuperar senha", "Enviaremos um link para você criar uma nova senha.", "Enviar link"], reset: ["Nova senha", "Escolha uma nova senha para sua conta.", "Salvar nova senha"] }[authMode];
  $("authTitle").textContent = t[0]; $("authSub").textContent = t[1]; $("aSubmit").textContent = t[2];
  $("aEmailF").hidden = authMode === "reset"; $("aPassF").hidden = authMode === "forgot";
  $("aPass").autocomplete = authMode === "login" ? "current-password" : "new-password";
  $("aToggle").textContent = authMode === "login" ? "Criar conta" : "Já tenho conta";
  $("aToggle").hidden = authMode === "reset"; $("aForgot").hidden = authMode !== "login";
  const m = $("aMsg"); m.textContent = msg || ""; m.className = "msg " + (cls || "");
}
function showAuth() { $("boot").hidden = true; $("app").hidden = true; $("auth").hidden = false; $("setupWarn").hidden = configured; paintAuth(); }
function showApp() { $("boot").hidden = true; $("auth").hidden = true; $("app").hidden = false; }
$("aToggle").addEventListener("click", () => { authMode = authMode === "login" ? "signup" : "login"; paintAuth(); });
$("aForgot").addEventListener("click", () => { authMode = "forgot"; paintAuth(); });
$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!sb) return paintAuth("Configure o config.js antes de entrar.", "err");
  const email = $("aEmail").value.trim(), password = $("aPass").value;
  if (authMode !== "reset" && !/^\S+@\S+\.\S+$/.test(email)) return paintAuth("Digite um e-mail válido.", "err");
  if (authMode !== "forgot" && password.length < 6) return paintAuth("A senha precisa ter pelo menos 6 caracteres.", "err");
  $("aSubmit").disabled = true;
  try {
    if (authMode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) paintAuth(error.message.includes("Invalid") ? "E-mail ou senha incorretos." : error.message.includes("confirm") ? "Confirme seu e-mail pelo link que enviamos antes de entrar." : error.message, "err");
    } else if (authMode === "signup") {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) paintAuth(error.message, "err");
      else if (!data.session) { authMode = "login"; paintAuth("Conta criada. Abra o link de confirmação enviado para o seu e-mail e depois entre.", "ok"); }
    } else if (authMode === "forgot") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) paintAuth(error.message, "err"); else { authMode = "login"; paintAuth("Se o e-mail tiver conta, você vai receber um link para criar uma nova senha.", "ok"); }
    } else if (authMode === "reset") {
      const { error } = await sb.auth.updateUser({ password });
      if (error) paintAuth(error.message, "err"); else { authMode = "login"; toast("Senha atualizada"); enterApp((await sb.auth.getUser()).data.user); }
    }
  } finally { $("aSubmit").disabled = false; }
});
document.addEventListener("click", async e => { if (e.target.closest("[data-logout]")) { await sb.auth.signOut(); } });

let entered = null;
function enterApp(user) {
  if (!user) return;
  S.user = user; $("userEmail").textContent = user.email || ""; $("userEmail2").textContent = user.email || "";
  showApp();
  if (entered !== user.id) { entered = user.id; const h = (location.hash || "").replace("#", ""); go(PAGES.some(p => p[0] === h) ? h : "painel"); loadAll(); }
}
function leaveApp() { entered = null; S.user = null; S.lanc = new Map(); S.config = null; S.loaded = false; authMode = "login"; showAuth(); }

/* =========================================================
   Parcelas / competência
   ========================================================= */
function entradas(l) {
  const total = cents(l.valor);
  const isCred = l.tipo === "despesa" && card(l.pagamento)?.modalidade === "credito";
  const n = isCred ? Math.max(1, Math.min(48, parseInt(l.parcelas) || 1)) : 1;
  const [y, m, d] = (l.data || TODAY).split("-").map(Number);
  let start = `${y}-${pad(m)}`;
  if (isCred) { const f = Number(card(l.pagamento).fechamento) || 0; if (f && d >= f) start = addM(start, 1); }
  const base = Math.floor(total / n), resto = total - base * n; const out = [];
  for (let i = 0; i < n; i++) out.push({ l, mes: addM(start, i), valor: base + (i === 0 ? resto : 0), num: i + 1, de: n });
  return out;
}
let FLAT = [];
function rebuild() { FLAT = []; for (const l of S.lanc.values()) FLAT.push(...entradas(l)); }
const sumWhere = f => FLAT.reduce((s, e) => (f(e) ? s + e.valor : s), 0);
const recMes = k => sumWhere(e => e.mes === k && e.l.tipo === "receita");
const despMes = k => sumWhere(e => e.mes === k && e.l.tipo === "despesa");

/* =========================================================
   Navegação
   ========================================================= */
function navHTML(cls) { return PAGES.map(([id, name]) => `<button type="button" class="${cls}" data-go="${id}"${S.route === id ? ' aria-current="page"' : ""}><svg aria-hidden="true"><use href="#i-${id}"/></svg><span>${name}</span></button>`).join(""); }
function go(r, opts) {
  if (!PAGES.some(p => p[0] === r)) r = "painel";
  if (S.route === "lancar" && r !== "lancar" && S.editId && !(opts && opts.keepEdit)) resetForm(true);
  S.route = r; try { history.replaceState(null, "", "#" + r); } catch (e) {}
  for (const [id] of PAGES) $("pg-" + id).hidden = id !== r;
  render(); window.scrollTo({ top: 0 });
}
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) go(b.dataset.go); });
$("prevM").addEventListener("click", () => { S.mes = addM(S.mes, -1); render(); });
$("nextM").addEventListener("click", () => { S.mes = addM(S.mes, 1); render(); });

let toastT = null;
function toast(t, err) { const el = $("toast"); el.textContent = t; el.className = "toast" + (err ? " err" : ""); el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 3200); }

function render() {
  if (!S.user) return;
  rebuild();
  $("sideNav").innerHTML = navHTML("navbtn"); $("bottomNav").innerHTML = navHTML("");
  const p = PAGES.find(x => x[0] === S.route);
  $("pageTitle").textContent = S.editId && S.route === "lancar" ? "Editar lançamento" : p[1]; $("pageSub").textContent = p[2];
  const showMonth = S.route === "painel" || S.route === "cartoes" || (S.route === "planilha" && (S.plan.per === "mes" || S.plan.per === "ano"));
  $("monthNav").hidden = !showMonth;
  $("mLabel").textContent = S.route === "planilha" && S.plan.per === "ano" ? S.mes.slice(0, 4) : cap(mesNome(S.mes));
  ({ painel: renderPainel, lancar: renderLancar, planilha: renderPlanilha, cartoes: renderCartoes, ajustes: renderAjustes })[S.route]();
}

/* =========================================================
   PAINEL
   ========================================================= */
function trend(curr, prev, goodWhenUp) {
  if (!prev) return `<span class="muted">sem base no mês anterior</span>`;
  const p = Math.round((curr - prev) / Math.abs(prev) * 100); const up = p >= 0; const good = goodWhenUp ? up : !up;
  return `<span class="trend ${p === 0 ? "" : good ? "good" : "bad"}">${up ? "▲" : "▼"} ${Math.abs(p)}%</span> vs ${MC[Number(addM(S.mes, -1).slice(5)) - 1]}`;
}
function renderPainel() {
  if (!S.loaded) { $("kpis").innerHTML = `<div class="kpi"><span class="loading">Carregando seus dados…</span></div>`; return; }
  const r = recMes(S.mes), d = despMes(S.mes), pr = recMes(addM(S.mes, -1)), pd = despMes(addM(S.mes, -1));
  const saldo = r - d, psaldo = pr - pd; const taxa = r > 0 ? Math.round(saldo / r * 100) : null;
  const futuro = sumWhere(e => e.mes > S.mes && e.l.tipo === "despesa" && e.de > 1);
  $("kpis").innerHTML = `
   <div class="kpi hero"><span class="label">Saldo do mês</span><span class="v">${money(saldo)}</span><span class="d">${trend(saldo, psaldo, true)}</span></div>
   <div class="kpi"><span class="label">Receitas</span><span class="v pos">${money(r)}</span><span class="d">${trend(r, pr, true)}</span></div>
   <div class="kpi"><span class="label">Despesas</span><span class="v neg">${money(d)}</span><span class="d">${trend(d, pd, false)}</span></div>
   <div class="kpi"><span class="label">Taxa de economia</span><span class="v">${taxa === null ? "—" : taxa + "%"}</span><span class="d">${futuro ? `Parcelas futuras: <b class="num">${money(futuro)}</b>` : "Nenhuma parcela futura"}</span></div>`;
  $("chartRD").innerHTML = chartRD();
  { const box = $("chartRD"); if (box.scrollWidth > box.clientWidth) box.scrollLeft = box.scrollWidth * (7.5 / 12) - box.clientWidth / 2; }

  const byCat = {}; FLAT.filter(e => e.mes === S.mes && e.l.tipo === "despesa").forEach(e => { const c = e.l.categoria || "Outros"; byCat[c] = (byCat[c] || 0) + e.valor; });
  const items = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $("catHint").textContent = mesNome(S.mes);
  $("donut").innerHTML = items.length ? donut(items) : `<div class="empty">Nenhuma despesa em ${mesNome(S.mes)}. <button class="linkbtn" data-go="lancar">Lançar agora</button></div>`;

  const creds = cfg().cartoes.filter(c => c.modalidade === "credito");
  $("limits").innerHTML = creds.length ? creds.map(c => {
    const fat = sumWhere(e => e.l.pagamento === c.id && e.mes === S.mes && e.l.tipo === "despesa");
    const usado = sumWhere(e => e.l.pagamento === c.id && e.mes >= CUR && e.l.tipo === "despesa");
    const lim = cents(c.limite); const pf = lim ? Math.min(100, fat / lim * 100) : 0; const pu = lim ? Math.min(100 - pf, Math.max(0, (usado - fat) / lim * 100)) : 0;
    return `<div class="limit"><div class="top"><span class="gname">${esc(c.nome)} <span class="sub">${c.final ? "••" + esc(c.final) : ""}</span></span><span class="num">${money(fat)}</span></div>
      ${lim ? `<div class="meter" title="Fatura do mês e parcelas futuras"><i style="width:${pf.toFixed(1)}%;background:var(--accent)"></i><i style="width:${pu.toFixed(1)}%;background:color-mix(in srgb,var(--accent) 35%,var(--surface-2))"></i></div>` : ""}
      <div class="foot"><span>${lim ? `Disponível <b class="num">${money(Math.max(0, lim - usado))}</b> de ${money(lim)}` : "Sem limite informado"}</span><span>${c.vencimento ? `vence dia ${c.vencimento}` : ""}</span></div></div>`;
  }).join("") : `<div class="empty">Cadastre um cartão de crédito para acompanhar o limite. <button class="linkbtn" data-go="cartoes">Cadastrar</button></div>`;

  const byPag = {}; FLAT.filter(e => e.mes === S.mes && e.l.tipo === "despesa").forEach(e => { byPag[e.l.pagamento] = (byPag[e.l.pagamento] || 0) + e.valor; });
  const pItems = Object.entries(byPag).sort((a, b) => b[1] - a[1]);
  $("byPag").innerHTML = pItems.length ? barList(pItems.map(([k, v]) => [pagShort(k), v, cardColorVar(k)])) : `<div class="empty">Nenhuma despesa neste mês.</div>`;
  const byR = {}; FLAT.filter(e => e.mes === S.mes && e.l.tipo === "receita").forEach(e => { const c = e.l.categoria || "Outros"; byR[c] = (byR[c] || 0) + e.valor; });
  const rItems = Object.entries(byR).sort((a, b) => b[1] - a[1]);
  $("byRec").innerHTML = rItems.length ? barList(rItems.map(([k, v]) => [k, v, catColor(k, "receita")])) : `<div class="empty">Nenhuma receita lançada neste mês.</div>`;

  const top = FLAT.filter(e => e.mes === S.mes && e.l.tipo === "despesa").sort((a, b) => b.valor - a.valor).slice(0, 6);
  $("topDesp").innerHTML = top.length ? top.map(e => `<tr><td><div class="gname">${esc(e.l.descricao)}</div><div class="sub">${esc(e.l.categoria)} · ${esc(pagShort(e.l.pagamento))}${e.de > 1 ? ` · parcela ${e.num}/${e.de}` : ""}</div></td><td class="r num">${money(e.valor)}</td></tr>`).join("") : `<tr><td class="empty">Nenhuma despesa neste mês.</td></tr>`;

  const g = {};
  for (const l of S.lanc.values()) { if (l.tipo !== "despesa") continue; const k = norm(l.descricao); if (!k) continue; const x = (g[k] = g[k] || { nome: l.descricao, cat: l.categoria, n: 0, t: 0, u: "" }); x.n++; x.t += cents(l.valor); if ((l.data || "") > x.u) { x.u = l.data; x.nome = l.descricao; x.cat = l.categoria; } }
  const reps = Object.values(g).filter(x => x.n > 1).sort((a, b) => b.t - a.t).slice(0, 8);
  $("repet").innerHTML = reps.length ? reps.map(x => `<tr><td><div class="gname">${esc(x.nome)}</div><div class="sub"><i class="dot" style="background:${catColor(x.cat, "despesa")};margin-right:5px"></i>${esc(x.cat)} · última em ${fmtDs(x.u)}</div></td><td class="r num">${x.n}×</td><td class="r num">${money(x.t)}</td><td class="r num">${money(Math.round(x.t / x.n))}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">Quando a mesma despesa aparecer mais de uma vez, ela entra aqui.</td></tr>`;

  const m1 = addM(S.mes, 1), m2 = addM(S.mes, 2), m3 = addM(S.mes, 3);
  $("fh1").textContent = mesCurto(m1); $("fh2").textContent = mesCurto(m2); $("fh3").textContent = mesCurto(m3);
  const pc = [...S.lanc.values()].filter(l => l.tipo === "despesa").map(l => ({ l, es: entradas(l) })).filter(x => x.es.length > 1 && x.es.some(e => e.mes > S.mes));
  $("futuras").innerHTML = pc.length ? pc.map(({ l, es }) => {
    const v = k => es.filter(e => e.mes === k).reduce((s, e) => s + e.valor, 0); const rest = es.filter(e => e.mes > S.mes);
    return `<tr><td><div class="gname">${esc(l.descricao)}</div><div class="sub">${es.length}× de ${money(es[es.length - 1].valor)}</div></td><td>${esc(pagShort(l.pagamento))}</td><td class="r num">${v(m1) ? money(v(m1)) : "—"}</td><td class="r num">${v(m2) ? money(v(m2)) : "—"}</td><td class="r num">${v(m3) ? money(v(m3)) : "—"}</td><td class="r num">${money(rest.reduce((s, e) => s + e.valor, 0))}<div class="sub">${rest.length} parcela${rest.length > 1 ? "s" : ""}</div></td></tr>`;
  }).join("") : `<tr><td colspan="6" class="empty">Nenhuma parcela a vencer depois de ${mesNome(S.mes)}.</td></tr>`;
}
function barList(items) {
  const tot = items.reduce((s, i) => s + i[1], 0), max = items[0][1] || 1;
  return items.map(([k, v, c]) => `<div class="bar"><div class="name"><i class="dot" style="background:${c}"></i><span>${esc(k)}</span></div><div class="val">${money(v)}<small>${tot ? Math.round(v / tot * 100) : 0}%</small></div><div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%;background:${c}"></div></div></div>`).join("");
}
function donut(items) {
  const tot = items.reduce((s, i) => s + i[1], 0); const R = 58, C = 2 * Math.PI * R; let acc = 0;
  const segs = items.map(([k, v]) => { const len = v / tot * C; const s = `<circle cx="75" cy="75" r="${R}" fill="none" style="stroke:${catColor(k, "despesa")}" stroke-width="22" stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${(C - len + 1.5).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 75 75)"><title>${esc(k)}: ${money(v)}</title></circle>`; acc += len; return s; }).join("");
  const short = money(tot).replace(/,\d\d$/, "");
  return `<div class="donutwrap"><svg viewBox="0 0 150 150" role="img" aria-label="Despesas por categoria">${segs}<text x="75" y="72" text-anchor="middle" class="ctr-l">TOTAL</text><text x="75" y="91" text-anchor="middle" class="ctr-v">${esc(short)}</text></svg>
   <div class="leglist">${items.slice(0, 8).map(([k, v]) => `<div class="leg"><i class="dot" style="background:${catColor(k, "despesa")}"></i><span>${esc(k)}</span><span class="num">${money(v)}<small>${Math.round(v / tot * 100)}%</small></span></div>`).join("")}${items.length > 8 ? `<div class="sub">+ ${items.length - 8} categorias</div>` : ""}</div></div>`;
}
function niceMax(v) { if (v <= 0) return 100000; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; }
function compact(c) { const v = c / 100; if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`; return `${Math.round(v)}`; }
function chartRD() {
  const keys = []; for (let i = -7; i <= 4; i++) keys.push(addM(S.mes, i));
  const rec = keys.map(recMes), des = keys.map(despMes);
  const W = 720, H = 250, L = 58, Rp = 10, T = 14, B = 30, pw = W - L - Rp, ph = H - T - B; const max = niceMax(Math.max(...rec, ...des));
  const y = v => T + ph - (v / max) * ph; const gw = pw / 12, bw = Math.min(18, gw * 0.3);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas por mês"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-ln"/></pattern></defs>`;
  const si = keys.indexOf(S.mes); s += `<rect class="selbg" x="${L + gw * si + 2}" y="${T}" width="${gw - 4}" height="${ph}" rx="6"/>`;
  for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); s += `<line class="grid" x1="${L}" x2="${W - Rp}" y1="${yy}" y2="${yy}"/><text class="axis" x="${L - 8}" y="${yy + 4}" text-anchor="end">${i === 0 ? "0" : compact(v)}</text>`; }
  keys.forEach((k, i) => {
    const x0 = L + gw * i, cx = x0 + gw / 2;
    const hr = Math.max(rec[i] ? 2 : 0, ph - (y(rec[i]) - T)), hd = Math.max(des[i] ? 2 : 0, ph - (y(des[i]) - T));
    s += `<rect class="rec" x="${cx - bw - 1.5}" y="${T + ph - hr}" width="${bw}" height="${hr}" rx="3"/>`;
    s += `<rect class="desp${k > CUR ? " fut" : ""}" x="${cx + 1.5}" y="${T + ph - hd}" width="${bw}" height="${hd}" rx="3"/>`;
    s += `<text class="xl${k === S.mes ? " sel" : ""}" x="${cx}" y="${H - 10}" text-anchor="middle">${MC[Number(k.slice(5)) - 1]}${k.slice(5) === "01" || i === 0 ? " " + k.slice(2, 4) : ""}</text>`;
    s += `<rect class="hit" data-m="${k}" x="${x0}" y="${T}" width="${gw}" height="${ph + B}"><title>${mesNome(k)} — receitas ${money(rec[i])}, despesas ${money(des[i])}</title></rect>`;
  });
  return s + `</svg>`;
}
$("chartRD").addEventListener("click", e => { const r = e.target.closest("[data-m]"); if (r) { S.mes = r.dataset.m; render(); } });

/* =========================================================
   LANÇAR
   ========================================================= */
for (let i = 1; i <= 24; i++) $("lParc").insertAdjacentHTML("beforeend", `<option value="${i}">${i === 1 ? "À vista (1×)" : i + "×"}</option>`);
$("lData").value = TODAY;
function fillSelects() {
  const k = S.kind; const cats = k === "receita" ? cfg().catReceita : cfg().catDespesa; const cv = $("lCat").value, pv = $("lPag").value;
  $("lCat").innerHTML = cats.map(c => `<option>${esc(c)}</option>`).join(""); if (cats.includes(cv)) $("lCat").value = cv;
  const cs = cfg().cartoes;
  $("lPag").innerHTML = (cs.length ? `<optgroup label="Cartões">${cs.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}${c.final ? " ••" + esc(c.final) : ""} · ${c.modalidade === "debito" ? "débito" : "crédito"}</option>`).join("")}</optgroup>` : "") + `<optgroup label="Outros">${Object.entries(METODOS).map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</optgroup>`;
  if ([...$("lPag").options].some(o => o.value === pv)) $("lPag").value = pv;
  const names = [...new Set([...S.lanc.values()].filter(l => l.tipo === k).map(l => l.descricao))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("descList").innerHTML = names.map(n => `<option value="${esc(n)}">`).join("");
}
function syncKindUI() {
  const k = S.kind; document.querySelectorAll("[data-kind]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.kind === k)));
  $("pagField").hidden = k === "receita";
  const isCred = k === "despesa" && card($("lPag").value)?.modalidade === "credito"; $("parcField").hidden = !isCred; if (!isCred) $("lParc").value = "1";
  $("lValorLbl").textContent = k === "receita" ? "Valor recebido" : "Valor total";
  $("lDesc").placeholder = k === "receita" ? "Ex.: Salário de outubro" : "Ex.: Mercado Extra";
  $("bSubmit").textContent = k === "receita" ? "Lançar receita" : "Lançar despesa";
  $("formTitle").textContent = S.editId ? "Editar lançamento" : (k === "receita" ? "Nova receita" : "Nova despesa");
  hint();
}
function hint() {
  const v = parseValor($("lValor").value); const h = $("lHint"); if (!(v > 0)) { h.textContent = ""; return; }
  const l = { tipo: S.kind, valor: v, data: $("lData").value || TODAY, pagamento: $("lPag").value, parcelas: $("lParc").value }; const es = entradas(l);
  h.textContent = S.kind === "receita" ? `Entra nas receitas de ${mesNome(es[0].mes)}` : (es.length > 1 ? `${es.length}× de ${money(es[es.length - 1].valor)} · ` : "") + `Primeira cobrança em ${mesNome(es[0].mes)}`;
}
document.querySelectorAll("[data-kind]").forEach(b => b.addEventListener("click", () => { if (S.kind === b.dataset.kind) return; S.kind = b.dataset.kind; fillSelects(); syncKindUI(); }));
["lValor", "lData", "lParc"].forEach(id => $(id).addEventListener("input", hint));
$("lPag").addEventListener("change", syncKindUI);
$("lDesc").addEventListener("change", () => {
  if (S.editId) return; const k = norm($("lDesc").value);
  const last = [...S.lanc.values()].filter(l => l.tipo === S.kind && norm(l.descricao) === k).sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
  if (last) { if ([...$("lCat").options].some(o => o.value === last.categoria)) $("lCat").value = last.categoria; if (last.pagamento && [...$("lPag").options].some(o => o.value === last.pagamento)) $("lPag").value = last.pagamento; syncKindUI(); }
});
function renderLancar() {
  fillSelects(); syncKindUI();
  const rec = [...S.lanc.values()].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 10);
  $("recent").innerHTML = rec.length ? rec.map(l => `<button type="button" data-edit="${esc(l.id)}"><span class="ico ${l.tipo === "receita" ? "r" : "d"}">${l.tipo === "receita" ? "+" : "−"}</span><span class="t"><div class="gname">${esc(l.descricao)}</div><div class="sub">${fmtD(l.data)} · ${esc(l.categoria)}${l.tipo === "despesa" ? " · " + esc(pagShort(l.pagamento)) : ""}${(l.parcelas || 1) > 1 && l.tipo === "despesa" ? ` · ${l.parcelas}×` : ""}</div></span><span class="num ${l.tipo === "receita" ? "pos" : "neg"}">${l.tipo === "receita" ? "+" : "−"}${money(cents(l.valor))}</span></button>`).join("") : `<div class="empty">${S.loaded ? "Nada lançado ainda. Seu primeiro lançamento aparece aqui." : "Carregando…"}</div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) startEdit(b.dataset.edit); });
function startEdit(id) {
  const l = S.lanc.get(id); if (!l) return; S.editId = id; S.kind = l.tipo; if (S.route !== "lancar") go("lancar", { keepEdit: true });
  fillSelects(); $("lDesc").value = l.descricao || ""; $("lValor").value = fmtIn(l.valor); $("lData").value = l.data || TODAY; $("lCat").value = l.categoria;
  if (l.tipo === "despesa" && l.pagamento) $("lPag").value = l.pagamento; $("lParc").value = String(l.parcelas || 1); $("lObs").value = l.obs || "";
  $("bNew").hidden = true; $("bEdit").hidden = false; disarm($("bDel"), "Excluir"); syncKindUI(); render(); $("lDesc").focus({ preventScroll: true });
}
function resetForm(silent) {
  S.editId = null; const keepPag = $("lPag").value; $("lForm").reset(); $("lData").value = TODAY; $("lParc").value = "1"; $("lPag").value = keepPag;
  $("bNew").hidden = false; $("bEdit").hidden = true; disarm($("bDel"), "Excluir"); if (!silent) render();
}
$("bCancel").addEventListener("click", () => resetForm());
const armTimers = new WeakMap();
function arm(b, label, orig) { if (b.classList.contains("armed")) return true; b.classList.add("armed"); b.textContent = label; armTimers.set(b, setTimeout(() => disarm(b, orig), 3500)); return false; }
function disarm(b, orig) { clearTimeout(armTimers.get(b)); b.classList.remove("armed"); b.textContent = orig; }
$("bDel").addEventListener("click", async () => {
  const b = $("bDel"); if (!arm(b, "Confirmar exclusão", "Excluir")) return; const id = S.editId; resetForm(true);
  try { await delLanc(id); toast("Lançamento excluído"); } catch (e) {}
});
let saving = false;
$("lForm").addEventListener("submit", async e => {
  e.preventDefault(); if (saving) return;
  const desc = $("lDesc").value.trim(), valor = parseValor($("lValor").value);
  if (!desc) return toast("Preencha a descrição.", 1);
  if (!(valor > 0)) return toast("Informe um valor maior que zero, como 129,90.", 1);
  const l = { tipo: S.kind, descricao: desc, valor, data: $("lData").value || TODAY, categoria: $("lCat").value || "Outros", obs: $("lObs").value.trim() };
  if (S.kind === "despesa") { l.pagamento = $("lPag").value; l.parcelas = card(l.pagamento)?.modalidade === "credito" ? parseInt($("lParc").value) || 1 : 1; }
  const editing = S.editId; saving = true;
  try { await saveLanc(editing, l); } catch (err) { return; } finally { saving = false; }
  if (editing) { resetForm(); toast("Alterações salvas"); }
  else {
    const keepPag = $("lPag").value, keepCat = $("lCat").value, keepData = $("lData").value;
    $("lForm").reset(); $("lPag").value = keepPag; $("lCat").value = keepCat; $("lData").value = keepData; $("lParc").value = "1"; syncKindUI();
    toast(`${S.kind === "receita" ? "Receita" : "Despesa"} lançada em ${mesNome(entradas(l)[0].mes)}`); $("lDesc").focus();
  }
});

/* =========================================================
   PLANILHA
   ========================================================= */
function planRows() {
  const P = S.plan; const q = norm(P.q); let rows;
  if (P.modo === "compras") rows = [...S.lanc.values()].map(l => { const es = entradas(l); return { l, comp: es[0].mes, valor: cents(l.valor), parc: es.length > 1 ? `${es.length}×` : "" }; });
  else rows = FLAT.map(e => ({ l: e.l, comp: e.mes, valor: e.valor, parc: e.de > 1 ? `${e.num}/${e.de}` : "" }));
  rows = rows.filter(r => {
    const l = r.l;
    if (P.tipo !== "todos" && l.tipo !== P.tipo) return false;
    if (P.cat !== "todas" && l.categoria !== P.cat) return false;
    if (P.pag !== "todos" && l.pagamento !== P.pag) return false;
    if (q && !norm(l.descricao + " " + (l.obs || "")).includes(q)) return false;
    const key = P.modo === "compras" ? (l.data || "") : r.comp;
    if (P.per === "mes" && !key.startsWith(S.mes)) return false;
    if (P.per === "ano" && !key.startsWith(S.mes.slice(0, 4))) return false;
    if (P.per === "custom") {
      const de = P.modo === "compras" ? P.de : P.de.slice(0, 7), ate = P.modo === "compras" ? P.ate : P.ate.slice(0, 7);
      if (de && key < de) return false; if (ate && key > ate) return false;
    }
    return true;
  });
  const dir = P.dir === "asc" ? 1 : -1;
  const get = { data: r => r.l.data || "", comp: r => r.comp, descricao: r => norm(r.l.descricao), categoria: r => norm(r.l.categoria), pag: r => norm(pagShort(r.l.pagamento)), tipo: r => r.l.tipo, valor: r => (r.l.tipo === "receita" ? r.valor : -r.valor) }[P.sort] || (r => r.l.data);
  rows.sort((a, b) => { const x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || (b.l.data || "").localeCompare(a.l.data || ""); });
  return rows;
}
function renderPlanilha() {
  const P = S.plan;
  const cats = [...new Set([...cfg().catDespesa, ...cfg().catReceita, ...[...S.lanc.values()].map(l => l.categoria)])];
  $("pCat").innerHTML = `<option value="todas">Todas</option>` + cats.map(c => `<option${P.cat === c ? " selected" : ""}>${esc(c)}</option>`).join("");
  $("pPag").innerHTML = `<option value="todos">Todos</option>` + cfg().cartoes.map(c => `<option value="${esc(c.id)}"${P.pag === c.id ? " selected" : ""}>${esc(c.nome)}${c.final ? " ••" + esc(c.final) : ""}</option>`).join("") + Object.entries(METODOS).map(([v, n]) => `<option value="${v}"${P.pag === v ? " selected" : ""}>${n}</option>`).join("");
  $("pPer").value = P.per; $("pTipo").value = P.tipo; $("pDeF").hidden = $("pAteF").hidden = P.per !== "custom";
  document.querySelectorAll("[data-modo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.modo === P.modo)));
  const cols = [["data", "Data"], ...(P.modo === "parcelas" ? [["comp", "Fatura"]] : []), ["descricao", "Descrição"], ["tipo", "Tipo"], ["categoria", "Categoria"], ["pag", "Pagamento"], [null, "Parcela"], ["valor", "Valor", "r"], [null, "", "r"]];
  $("sheetHead").innerHTML = `<tr>${cols.map(([k, n, c]) => `<th class="${c || ""}">${k ? `<button type="button" data-sort="${k}" data-dir="${P.sort === k ? P.dir : ""}">${n}</button>` : n}</th>`).join("")}</tr>`;
  const rows = planRows();
  $("sheetEmpty").hidden = rows.length > 0 || !S.loaded;
  $("sheetBody").innerHTML = rows.map(r => {
    const l = r.l; const rec = l.tipo === "receita";
    return `<tr>
    <td class="num">${fmtD(l.data)}</td>${P.modo === "parcelas" ? `<td class="num">${mesCurto(r.comp)}</td>` : ""}
    <td class="desc"><span class="gname">${esc(l.descricao)}</span>${l.obs ? `<div class="sub">${esc(l.obs)}</div>` : ""}</td>
    <td><span class="kind ${l.tipo}">${rec ? "Receita" : "Despesa"}</span></td>
    <td><span class="pill"><i class="dot" style="background:${catColor(l.categoria, l.tipo)}"></i>${esc(l.categoria)}</span></td>
    <td>${rec ? '<span class="muted">—</span>' : esc(pagLabel(l.pagamento))}</td>
    <td class="num">${r.parc || '<span class="muted">—</span>'}</td>
    <td class="r num ${rec ? "pos" : "neg"}">${rec ? "+" : "−"}${money(r.valor)}</td>
    <td><div class="rowact"><button type="button" class="iconbtn" data-edit="${esc(l.id)}" aria-label="Editar ${esc(l.descricao)}">Editar</button><button type="button" class="iconbtn danger" data-del="${esc(l.id)}" aria-label="Excluir ${esc(l.descricao)}">Excluir</button></div></td></tr>`;
  }).join("");
  const tr = rows.filter(r => r.l.tipo === "receita").reduce((s, r) => s + r.valor, 0), td = rows.filter(r => r.l.tipo === "despesa").reduce((s, r) => s + r.valor, 0);
  $("sheetFoot").innerHTML = rows.length ? `<tr><td colspan="${cols.length - 2}"><div class="sheetfoot"><span>${rows.length} lançamento${rows.length > 1 ? "s" : ""}</span><span>Receitas <b class="num pos">${money(tr)}</b></span><span>Despesas <b class="num neg">${money(td)}</b></span></div></td><td class="r num ${tr - td < 0 ? "neg" : "pos"}">${money(tr - td)}</td><td></td></tr>` : "";
}
$("sheetHead").addEventListener("click", e => {
  const b = e.target.closest("[data-sort]"); if (!b) return; const k = b.dataset.sort;
  if (S.plan.sort === k) S.plan.dir = S.plan.dir === "asc" ? "desc" : "asc"; else { S.plan.sort = k; S.plan.dir = k === "data" || k === "valor" || k === "comp" ? "desc" : "asc"; }
  renderPlanilha();
});
$("sheetBody").addEventListener("click", async e => { const b = e.target.closest("[data-del]"); if (!b) return; if (!arm(b, "Confirmar", "Excluir")) return; try { await delLanc(b.dataset.del); toast("Lançamento excluído"); } catch (e) {} });
let qT = null; $("pQ").addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(() => { S.plan.q = $("pQ").value; renderPlanilha(); }, 150); });
$("pPer").addEventListener("change", () => { S.plan.per = $("pPer").value; render(); });
$("pDe").addEventListener("change", () => { S.plan.de = $("pDe").value; renderPlanilha(); });
$("pAte").addEventListener("change", () => { S.plan.ate = $("pAte").value; renderPlanilha(); });
$("pTipo").addEventListener("change", () => { S.plan.tipo = $("pTipo").value; renderPlanilha(); });
$("pCat").addEventListener("change", () => { S.plan.cat = $("pCat").value; renderPlanilha(); });
$("pPag").addEventListener("change", () => { S.plan.pag = $("pPag").value; renderPlanilha(); });
document.querySelectorAll("[data-modo]").forEach(b => b.addEventListener("click", () => { S.plan.modo = b.dataset.modo; if (S.plan.sort === "comp" && b.dataset.modo === "compras") S.plan.sort = "data"; renderPlanilha(); }));
$("pClear").addEventListener("click", () => { S.plan = { ...S.plan, q: "", per: "mes", de: "", ate: "", tipo: "todos", cat: "todas", pag: "todos" }; $("pQ").value = ""; $("pDe").value = ""; $("pAte").value = ""; render(); });

function csv(rows, modo) {
  const q = v => { v = String(v ?? ""); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }; const n = c => (c / 100).toFixed(2).replace(".", ",");
  const head = ["Data", ...(modo === "parcelas" ? ["Fatura"] : []), "Descrição", "Tipo", "Categoria", "Pagamento", "Parcela", "Valor", "Observação"];
  const lines = rows.map(r => { const l = r.l; return [fmtD(l.data), ...(modo === "parcelas" ? [mesCurto(r.comp)] : []), l.descricao, l.tipo === "receita" ? "Receita" : "Despesa", l.categoria, l.tipo === "receita" ? "" : pagLabel(l.pagamento), r.parc, (l.tipo === "receita" ? "" : "-") + n(r.valor), l.obs || ""].map(q).join(";"); });
  return "﻿" + [head.join(";"), ...lines].join("\r\n");
}
function download(filename, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$("pCsv").addEventListener("click", () => download(`lancamentos-${S.plan.per === "mes" ? S.mes : S.plan.per === "ano" ? S.mes.slice(0, 4) : "filtrado"}.csv`, csv(planRows(), S.plan.modo), "text/csv;charset=utf-8"));

/* =========================================================
   CARTÕES
   ========================================================= */
function plastic(c) { return `<div class="plastic cor-${esc(CORES.includes(c.cor) ? c.cor : "petroleo")}"><div class="ptop"><span class="pname">${esc(c.nome)}</span><span class="pmod">${c.modalidade === "debito" ? "Débito" : "Crédito"}</span></div><span class="chip" aria-hidden="true"></span><div class="pnum">•••• •••• •••• ${esc(c.final || "····")}</div><div class="pfoot"><span>${c.modalidade === "credito" && c.fechamento ? `Fecha dia ${c.fechamento}` : ""}</span><span>${c.modalidade === "credito" && c.vencimento ? `Vence dia ${c.vencimento}` : ""}</span></div></div>`; }
function renderCartoes() {
  const cs = cfg().cartoes; const mc = MC[Number(S.mes.slice(5)) - 1];
  $("cardGrid").innerHTML = (S.loaded ? "" : `<p class="loading">Carregando…</p>`) + cs.map(c => {
    const es = FLAT.filter(e => e.l.pagamento === c.id && e.mes === S.mes && e.l.tipo === "despesa"); const fat = es.reduce((s, e) => s + e.valor, 0);
    let stats;
    if (c.modalidade === "credito") {
      const usado = sumWhere(e => e.l.pagamento === c.id && e.mes >= CUR && e.l.tipo === "despesa"); const lim = cents(c.limite);
      stats = `<div><span>Fatura de ${mc}</span><b>${money(fat)}</b></div><div><span>Disponível</span><b>${lim ? money(Math.max(0, lim - usado)) : "—"}</b></div><div><span>Limite</span><b>${lim ? money(lim) : "—"}</b></div><div><span>Lançamentos</span><b>${es.length}</b></div>`;
    } else stats = `<div><span>Gasto em ${mc}</span><b>${money(fat)}</b></div><div><span>Lançamentos</span><b>${es.length}</b></div>`;
    return `<div class="cardbox">${plastic(c)}<div class="cardstats">${stats}</div><div class="btnrow"><button type="button" class="btn ghost sm" data-cedit="${esc(c.id)}">Editar cartão</button><button type="button" class="btn ghost sm" data-cview="${esc(c.id)}">Ver lançamentos</button></div></div>`;
  }).join("") + `<div class="cardbox"><button type="button" class="addcard" id="addCardBtn">+ Adicionar cartão</button></div>`;
}
$("cardGrid").addEventListener("click", e => {
  if (e.target.closest("#addCardBtn")) return openCard(null);
  const ed = e.target.closest("[data-cedit]"); if (ed) return openCard(ed.dataset.cedit);
  const v = e.target.closest("[data-cview]"); if (v) { S.plan = { ...S.plan, pag: v.dataset.cview, tipo: "despesa", per: "mes", modo: "parcelas" }; go("planilha"); }
});
const daysOpts = () => `<option value="0">—</option>` + Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">Dia ${i + 1}</option>`).join("");
$("cFech").innerHTML = daysOpts(); $("cVenc").innerHTML = daysOpts();
function paintCardForm() {
  document.querySelectorAll("[data-mod]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mod === S.cardMod)));
  $("cCredit").hidden = S.cardMod !== "credito";
  $("cCor").innerHTML = CORES.map(c => `<button type="button" class="cor-${c}" data-cor="${c}" aria-label="Cor ${c}" aria-pressed="${S.cardCor === c}"></button>`).join("");
}
function openCard(id) {
  S.cardEdit = id; const c = id ? card(id) : null;
  $("cmTitle").textContent = c ? "Editar cartão" : "Novo cartão"; $("cNome").value = c?.nome || ""; $("cFinal").value = c?.final || "";
  $("cLimite").value = fmtIn(c?.limite); $("cFech").value = String(c?.fechamento || 0); $("cVenc").value = String(c?.vencimento || 0);
  S.cardMod = c?.modalidade || "credito"; S.cardCor = c?.cor || CORES[cfg().cartoes.length % CORES.length];
  $("cDel").hidden = !c; disarm($("cDel"), "Excluir"); paintCardForm(); $("cardModal").hidden = false; $("cNome").focus();
}
function closeCard() { $("cardModal").hidden = true; S.cardEdit = null; }
$("cmClose").addEventListener("click", closeCard);
$("cardModal").addEventListener("click", e => { if (e.target === $("cardModal")) closeCard(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("cardModal").hidden) closeCard(); });
$("cMod").addEventListener("click", e => { const b = e.target.closest("[data-mod]"); if (b) { S.cardMod = b.dataset.mod; paintCardForm(); } });
$("cCor").addEventListener("click", e => { const b = e.target.closest("[data-cor]"); if (b) { S.cardCor = b.dataset.cor; paintCardForm(); } });
$("cFinal").addEventListener("input", () => { $("cFinal").value = $("cFinal").value.replace(/\D/g, "").slice(0, 4); });
$("cForm").addEventListener("submit", async e => {
  e.preventDefault(); const nome = $("cNome").value.trim(), fin = $("cFinal").value.trim();
  if (!nome) return toast("Dê um nome ao cartão.", 1);
  if (fin && fin.length !== 4) return toast("O final do cartão tem 4 dígitos.", 1);
  const lim = parseValor($("cLimite").value); const cred = S.cardMod === "credito";
  const data = { nome, final: fin, modalidade: S.cardMod, cor: S.cardCor, limite: cred && lim > 0 ? lim : 0, fechamento: cred ? Number($("cFech").value) || 0 : 0, vencimento: cred ? Number($("cVenc").value) || 0 : 0 };
  $("cSave").disabled = true;
  try { await saveCard(S.cardEdit, data); closeCard(); toast("Cartão salvo"); } catch (err) {} finally { $("cSave").disabled = false; }
});
$("cDel").addEventListener("click", async () => {
  const b = $("cDel"); const n = [...S.lanc.values()].filter(l => l.pagamento === S.cardEdit).length;
  if (!arm(b, n ? `Excluir (${n} lançamentos ficam sem cartão)` : "Confirmar exclusão", "Excluir")) return;
  const id = S.cardEdit; closeCard();
  try { await delCard(id); toast("Cartão excluído"); } catch (e) {}
});

/* =========================================================
   AJUSTES
   ========================================================= */
function renderAjustes() {
  const tags = (key, kind) => cfg()[key].map(c => `<span class="tag"><i class="dot" style="background:${catColor(c, kind)}"></i>${esc(c)}<button type="button" data-rmcat="${key}" data-cat="${esc(c)}" aria-label="Remover ${esc(c)}">×</button></span>`).join("");
  $("catDList").innerHTML = tags("catDespesa", "despesa"); $("catRList").innerHTML = tags("catReceita", "receita");
  const n = S.lanc.size, nc = cfg().cartoes.length;
  $("dataCount").textContent = `${n} lançamento${n === 1 ? "" : "s"} · ${nc} ${nc === 1 ? "cartão" : "cartões"}`;
  let tema = "sistema"; try { tema = localStorage.getItem("tema") || "sistema"; } catch (e) {}
  document.querySelectorAll("[data-tema]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tema === tema)));
}
document.addEventListener("click", async e => {
  const a = e.target.closest("[data-addcat]");
  if (a) {
    const key = a.dataset.addcat; const inp = key === "catDespesa" ? $("newCatD") : $("newCatR"); const v = inp.value.trim(); if (!v) return;
    if (cfg()[key].some(c => norm(c) === norm(v))) return toast("Essa categoria já existe.", 1);
    const next = { catDespesa: cfg().catDespesa.slice(), catReceita: cfg().catReceita.slice() }; next[key].push(v); inp.value = "";
    try { await saveCats(next.catDespesa, next.catReceita); } catch (err) {}
    return;
  }
  const r = e.target.closest("[data-rmcat]");
  if (r) {
    if (!arm(r, "✓", "×")) return;
    const next = { catDespesa: cfg().catDespesa.slice(), catReceita: cfg().catReceita.slice() }; next[r.dataset.rmcat] = next[r.dataset.rmcat].filter(x => x !== r.dataset.cat);
    try { await saveCats(next.catDespesa, next.catReceita); } catch (err) {}
    return;
  }
  const t = e.target.closest("[data-tema]");
  if (t) {
    const v = t.dataset.tema; try { localStorage.setItem("tema", v); } catch (err) {}
    if (v === "sistema") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v === "claro" ? "light" : "dark";
    renderAjustes();
  }
});
["newCatD", "newCatR"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); document.querySelector(`[data-addcat="${id === "newCatD" ? "catDespesa" : "catReceita"}"]`).click(); } }));

$("bBackup").addEventListener("click", () => {
  const data = { app: "controle-de-cartoes", versao: 2, exportadoEm: new Date().toISOString(), config: cfg(), lancamentos: [...S.lanc.values()] };
  download(`backup-financas-${TODAY}.json`, JSON.stringify(data, null, 2), "application/json");
});
$("bCsvAll").addEventListener("click", () => {
  const rows = [...S.lanc.values()].sort((a, b) => (a.data || "").localeCompare(b.data || "")).map(l => { const es = entradas(l); return { l, comp: es[0].mes, valor: cents(l.valor), parc: es.length > 1 ? `${es.length}×` : "" }; });
  download(`lancamentos-completo-${TODAY}.csv`, csv(rows, "compras"), "text/csv;charset=utf-8");
});

// Importa um backup (deste site ou do app anterior). Lançamentos e cartões marcados como exemplo são ignorados.
$("importFile").addEventListener("change", async e => {
  const file = e.target.files && e.target.files[0]; e.target.value = ""; if (!file) return;
  let j; try { j = JSON.parse(await file.text()); } catch (err) { return toast("Esse arquivo não é um backup válido.", 1); }
  const cards = (j.config?.cartoes || []).filter(c => !c.exemplo);
  const lancs = (j.lancamentos || []).filter(l => !l.exemplo && (l.tipo === "despesa" || l.tipo === "receita") && Number(l.valor) > 0 && l.descricao);
  const ignorados = (j.lancamentos || []).length - lancs.length;
  if (!cards.length && !lancs.length) return toast("Nada para importar (dados de exemplo são ignorados).", 1);
  toast("Importando…");
  try {
    const idMap = {};
    for (const c of cards) {
      const same = cfg().cartoes.find(x => norm(x.nome) === norm(c.nome) && (x.final || "") === (c.final || ""));
      if (same) { idMap[c.id] = same.id; continue; }
      const body = { nome: String(c.nome).slice(0, 60), final: /^\d{4}$/.test(c.final || "") ? c.final : "", modalidade: c.modalidade === "debito" ? "debito" : "credito", cor: CORES.includes(c.cor) ? c.cor : "petroleo", limite: Number(c.limite) || 0, fechamento: Number(c.fechamento) || 0, vencimento: Number(c.vencimento) || 0 };
      const { data, error } = await sb.from("cartoes").insert(body).select().single(); if (error) throw error; idMap[c.id] = data.id;
    }
    const rows = lancs.map(l => ({
      tipo: l.tipo, descricao: String(l.descricao).slice(0, 120), valor: Math.round(Number(l.valor) * 100) / 100, data: /^\d{4}-\d{2}-\d{2}$/.test(l.data || "") ? l.data : TODAY,
      categoria: l.categoria || "Outros", pagamento: l.tipo === "despesa" ? (idMap[l.pagamento] || (METODOS[l.pagamento] ? l.pagamento : null)) : null,
      parcelas: Math.max(1, Math.min(48, parseInt(l.parcelas) || 1)), obs: String(l.obs || ""),
    }));
    for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("lancamentos").insert(rows.slice(i, i + 500)); if (error) throw error; }
    const cd = [...new Set([...cfg().catDespesa, ...(j.config?.catDespesa || [])])], cr = [...new Set([...cfg().catReceita, ...(j.config?.catReceita || [])])];
    if (cd.length !== cfg().catDespesa.length || cr.length !== cfg().catReceita.length) await saveCats(cd, cr);
    await loadAll();
    toast(`Importados ${rows.length} lançamentos${cards.length ? ` e ${Object.keys(idMap).length} cartões` : ""}${ignorados ? ` (${ignorados} exemplos ignorados)` : ""}.`);
  } catch (err) { console.error(err); toast("A importação parou no meio. Confira a planilha antes de importar de novo.", 1); await loadAll(); }
});

/* =========================================================
   Início
   ========================================================= */
if (!sb) { showAuth(); }
else {
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { authMode = "reset"; showAuth(); return; }
    // setTimeout: o supabase-js recomenda não chamar o banco dentro deste callback
    if (session?.user) { if (authMode !== "reset") setTimeout(() => enterApp(session.user), 0); }
    else setTimeout(leaveApp, 0);
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) showAuth(); });
}
