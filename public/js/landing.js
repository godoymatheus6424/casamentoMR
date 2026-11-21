// Página inicial pública (antes do login): apresenta o planejador.
import { state } from './store.js';
import { html, icon } from './ui.js';

const app = document.getElementById('app');
export const BRAND = 'BRIDEx';

const FEATURES = [
  ['home', 'Visão geral', 'Contagem regressiva, próximas tarefas, pagamentos que vencem e o que ainda falta contratar, tudo na primeira tela.'],
  ['check', 'Checklist completo', 'Mais de 45 tarefas organizadas do "12 meses antes" até a semana do casamento, com prazos calculados pela data.'],
  ['briefcase', 'Fornecedores e contratos', 'Orçamentos, contatos com WhatsApp, avaliação e a cópia do contrato guardada na ficha de cada fornecedor.'],
  ['wallet', 'Orçamento e parcelas', 'Planejado, contratado e pago por categoria. Gere as parcelas e saiba o que vence a cada mês.'],
  ['users', 'Convidados e presença', 'Cole a lista direto do Excel, controle confirmações, crianças e restrições alimentares.'],
  ['tables', 'Mapa de mesas', 'Distribua os convidados com lotação de cada mesa e veja quem ainda está sem lugar.'],
  ['clock', 'Cronograma do dia', 'O roteiro do grande dia com horários e responsáveis, pronto para imprimir e entregar.'],
  ['file', 'Documentos e inspirações', 'Contratos, comprovantes e fotos de referência num só lugar, organizados por categoria.'],
  ['note', 'Anotações e presentes', 'Reuniões, ideias, votos, e a lista de presentes com controle de agradecimentos.'],
];

const FAQ = [
  ['Preciso de cartão de crédito para testar?', 'Não. O período de teste é grátis, com todas as funções liberadas, e não pedimos cartão.'],
  ['O que acontece quando o teste acaba?', 'Seus dados continuam guardados e disponíveis para consulta e download. Para continuar editando, basta assinar um dos planos.'],
  ['Meu par e a nossa assessoria podem usar junto?', 'Sim. Os noivos dão acesso ao par, à assessoria e à família. Todos veem o mesmo planejamento, atualizado em tempo real.'],
  ['Sou assessora. Preciso de uma conta por casamento?', 'Não. Você tem um único perfil e troca entre os casamentos que atende. Cada casal dá acesso pelo seu e-mail.'],
  ['Funciona no celular?', 'Sim, no celular, no tablet e no computador. No celular, adicione à tela de início para abrir como um aplicativo.'],
  ['Meus dados ficam seguros?', 'Cada casamento fica isolado dos demais, as senhas são criptografadas e os arquivos só abrem para quem tem acesso. Não exibimos anúncios nem vendemos dados.'],
];

const monogram = () => html`<svg class="monogram" viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="46" cy="36" r="22"/><circle cx="74" cy="36" r="22"/><path d="M60 4l4 6-4 5-4-5z" fill="currentColor" stroke="none"/></svg>`;

export function renderLanding() {
  const st = state.status || {};
  const open = !!st.signupOpen;
  const days = st.trialDays || 14;
  const price = st.pricing || { monthly: '9,90', annual: '89' };
  const annualMonthly = (Number(String(price.annual).replace(',', '.')) / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cta = open
    ? html`<a href="#/cadastro" class="btn btn-primary btn-lg">Começar grátis por ${days} dias</a>`
    : html`<a href="#/entrar" class="btn btn-primary btn-lg">Entrar</a>`;

  document.title = `${BRAND} · Planejamento de casamento`;
  app.innerHTML = String(html`<div class="landing">
    <header class="lp-nav" id="lp-nav">
      <a href="#/" class="lp-brand">${monogram()}<span>${BRAND}</span></a>
      <nav class="lp-links" aria-label="Seções">
        <a href="#recursos" data-scroll>Recursos</a>
        <a href="#assessoras" data-scroll>Assessoras</a>
        <a href="#precos" data-scroll>Preços</a>
        <a href="#duvidas" data-scroll>Dúvidas</a>
      </nav>
      <div class="lp-actions">
        <a href="#/entrar" class="btn btn-ghost lp-login">Entrar</a>
        ${open ? html`<a href="#/cadastro" class="btn btn-primary">Criar conta</a>` : ''}
      </div>
    </header>

    <section class="lp-hero">
      <div class="lp-hero-bg" aria-hidden="true"></div>
      <div class="lp-hero-content">
        ${monogram()}
        <p class="lp-wordmark">${BRAND}</p>
        <p class="lp-eyebrow">Planejamento de casamento</p>
        <h1><span class="l1">Do sim ao grande dia,</span> <em>tudo num só lugar</em></h1>
        <p class="lp-lead">Troque as planilhas por um planejador feito para noivos e assessoras: tarefas, fornecedores e contratos, orçamento, convidados e mesas. No celular, no tablet e no computador.</p>
        <div class="lp-cta">${cta}${open ? html`<a href="#/entrar" class="btn btn-ghost btn-lg lp-ghost-light">Já tenho conta</a>` : ''}</div>
        ${open ? html`<p class="lp-note">Sem cartão de crédito · Cancele quando quiser</p>` : ''}
      </div>
      <div class="lp-lace" aria-hidden="true"></div>
    </section>

    <section class="lp-section" id="recursos">
      <div class="lp-head reveal">
        <p class="lp-kicker">Tudo o que vocês precisam</p>
        <h2>Cada detalhe do casamento, organizado</h2>
        <p>Do primeiro orçamento ao último agradecimento, sem fórmulas quebradas nem abas perdidas.</p>
      </div>
      <div class="lp-features">
        ${FEATURES.map(([ic, title, text]) => html`<article class="lp-feature reveal"><span class="lp-ic">${icon(ic)}</span><h3>${title}</h3><p>${text}</p></article>`)}
      </div>
    </section>

    <section class="lp-section lp-alt">
      <div class="lp-split">
        <div class="lp-head left reveal">
          <p class="lp-kicker">Adeus, planilha</p>
          <h2>Feito para substituir o Excel do casamento</h2>
          <p>A planilha começa simples e vira um labirinto. Aqui, tudo conversa entre si: o fornecedor contratado entra no orçamento, as parcelas viram alertas e a lista de convidados vira o mapa de mesas.</p>
        </div>
        <ul class="lp-checks reveal">
          <li>${icon('tick')}<span><strong>Importe sua lista</strong> colando direto do Excel ou do Google Sheets.</span></li>
          <li>${icon('tick')}<span><strong>Avisos automáticos</strong> de tarefas e pagamentos atrasados.</span></li>
          <li>${icon('tick')}<span><strong>Contratos sempre à mão,</strong> na ficha de cada fornecedor.</span></li>
          <li>${icon('tick')}<span><strong>Os dois editando juntos,</strong> cada um no seu celular.</span></li>
          <li>${icon('tick')}<span><strong>Exporte para o Excel</strong> quando quiser: os dados são de vocês.</span></li>
        </ul>
      </div>
    </section>

    <section class="lp-section" id="assessoras">
      <div class="lp-split reverse">
        <div class="lp-head left reveal">
          <p class="lp-kicker">Para assessoras e cerimonialistas</p>
          <h2>Todos os seus casamentos, num só perfil</h2>
          <p>Os noivos dão acesso pelo seu e-mail e você acompanha o planejamento junto com eles: contratos, fornecedores, convidados e o cronograma do dia. Troque de casamento em um toque, sem criar uma conta para cada casal.</p>
        </div>
        <div class="lp-mock reveal" aria-hidden="true">
          <p class="lp-mock-title">Meus casamentos</p>
          <div class="lp-mock-item"><strong>109</strong><span><b>Ana &amp; Pedro</b><small>10 de março · Villa Toscana</small></span></div>
          <div class="lp-mock-item"><strong>186</strong><span><b>Júlia &amp; Rafa</b><small>15 de maio · Igreja São José</small></span></div>
          <div class="lp-mock-item"><strong>273</strong><span><b>Bia &amp; Caio</b><small>21 de agosto · Fazenda Boa Vista</small></span></div>
        </div>
      </div>
    </section>

    <section class="lp-section lp-alt">
      <div class="lp-head reveal">
        <p class="lp-kicker">Privado de verdade</p>
        <h2>O casamento é de vocês. Os dados também.</h2>
      </div>
      <div class="lp-trust">
        <div class="reveal">${icon('shield')}<h3>Sem anúncios</h3><p>Não vendemos dados nem empurramos fornecedores. A ferramenta trabalha para vocês.</p></div>
        <div class="reveal">${icon('users')}<h3>Acesso sob controle</h3><p>Só os noivos decidem quem entra: o par, a assessoria ou a família.</p></div>
        <div class="reveal">${icon('download')}<h3>Leve tudo com você</h3><p>Baixe todos os dados ou exclua a conta quando quiser, como manda a LGPD.</p></div>
      </div>
    </section>

    <section class="lp-section" id="precos">
      <div class="lp-head reveal">
        <p class="lp-kicker">Preços</p>
        <h2>Menos que um café por mês</h2>
        <p>${days} dias grátis com tudo liberado. Depois, escolha o plano que fizer mais sentido.</p>
      </div>
      <div class="lp-prices">
        <div class="lp-price reveal"><h3>Mensal</h3><p class="lp-amount">R$ ${price.monthly}<small>/mês</small></p><p>Ideal para quem já está na reta final.</p></div>
        <div class="lp-price best reveal"><span class="badge b-accent">Mais escolhido</span><h3>Anual</h3><p class="lp-amount">R$ ${price.annual}<small>/ano</small></p><p>Equivale a R$ ${annualMonthly} por mês, para planejar com calma.</p></div>
      </div>
      <div class="lp-center reveal">${cta}</div>
    </section>

    <section class="lp-section lp-alt" id="duvidas">
      <div class="lp-head reveal"><p class="lp-kicker">Dúvidas frequentes</p><h2>Perguntas e respostas</h2></div>
      <div class="lp-faq">${FAQ.map(([q, a]) => html`<details class="reveal"><summary>${q}${icon('plus')}</summary><p>${a}</p></details>`)}</div>
    </section>

    <section class="lp-final">
      <div class="lp-lace top" aria-hidden="true"></div>
      <div class="lp-final-content reveal">
        ${monogram()}
        <h2>Comecem hoje a planejar o grande dia</h2>
        <div class="lp-cta">${cta}</div>
      </div>
    </section>

    <footer class="lp-footer">
      <span>© ${new Date().getFullYear()} ${BRAND}</span>
      <nav><a href="/termos.html">Termos de Uso</a><a href="/privacidade.html">Privacidade</a><a href="#/entrar">Entrar</a></nav>
    </footer>
  </div>`);

  window.scrollTo(0, 0);
  bindLanding();
}

let observer = null;
function bindLanding() {
  const root = app.querySelector('.landing');
  // Links internos rolam suavemente sem mudar o endereço (#/...)
  root.querySelectorAll('[data-scroll]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  // Barra do topo fica sólida depois da abertura
  const nav = root.querySelector('#lp-nav');
  const hero = root.querySelector('.lp-hero');
  observer?.disconnect();
  observer = new IntersectionObserver(([entry]) => nav.classList.toggle('solid', !entry.isIntersecting), { rootMargin: '-72px 0px 0px 0px' });
  observer.observe(hero);
  // Animação suave ao aparecer (respeita "reduzir movimento")
  const items = root.querySelectorAll('.reveal');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
}
