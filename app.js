(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const {Machine, assemble, SYMBOLS} = CPULab;
  const EXAMPLES = {
    add: {source: '; Soma entre memórias\n; M21 recebe 7 + 5\n\nADD M13 M15 M21\nHLT\n\n; Dados iniciais\nM13: 7\nM15: 5\nM21: 0', note: 'Siga o caminho de <strong>7 + 5</strong> e observe o resultado <strong>12</strong> chegar a M21.'},
    arithmetic: {source: '; (12 + 8) × 3 − 4\n\nADD M20 M21 M22\nMUL M22 #3 M23\nSUB M23 #4 M24\nHLT\n\nM20: 12\nM21: 8\nM22: 0\nM23: 0\nM24: 0', note: 'Três ciclos de cálculo: <strong>20 → 60 → 56</strong>. Observe CI, ACC e as escritas na memória.'},
    loop: {source: '; Soma de 1 até 5\nMOV #0 M30\nMOV #1 M31\n\nrepetir:\nADD M30 M31 M30\nINC M31\nCMP M31 #6\nJL repetir\nHLT\n\nM30: 0\nM31: 1', note: 'Acompanhe o salto do CI. O laço soma <strong>1 + 2 + 3 + 4 + 5 = 15</strong> em M30.'},
    logic: {source: '; Máscaras de bits\n; 12 = 1100, 10 = 1010\n\nAND M20 M21 M22\nOR M20 M21 M23\nXOR M20 M21 M24\nSHL M22 #1 M25\nHLT\n\nM20: 12\nM21: 10', note: '<strong>AND = 8, OR = 14, XOR = 6.</strong> Depois, o deslocamento à esquerda transforma 8 em 16.'},
    immediate: {source: '; Operar sem buscar\n; operandos na memória\n\nLOAD #10\nADD #5\nMUL #2\nSTORE M25\nHLT\n\nM25: 0', note: 'Os valores imediatos vêm da instrução. O ACC passa por <strong>10 → 15 → 30</strong> antes da escrita em M25.'}
  };
  const INFO = {
    CI: ['CI · Contador de Instrução', 'Guarda o endereço da próxima instrução a buscar. Após a busca, é incrementado em 1. Saltos podem substituir seu valor. Também é conhecido como PC (Program Counter).'],
    REM: ['REM · Endereço da Memória', 'Contém o endereço da posição que será lida ou escrita na memória principal. Ele transporta o endereço, não o conteúdo. Equivalente ao MAR.'],
    RDM: ['RDM · Dados da Memória', 'Recebe o conteúdo lido da memória ou guarda o conteúdo que será escrito nela. Pode carregar uma instrução ou um número. Equivalente ao MDR.'],
    RI: ['RI · Registrador de Instrução', 'Mantém a instrução atual durante a decodificação e a execução, mesmo depois que o CI avança. Equivalente ao IR.'],
    DI: ['DI · Decodificador de Instrução', 'Interpreta RI e separa o código da operação e seus operandos. Aqui, DI é um bloco lógico; seus campos são exibidos como estado didático, não como uma exigência de um processador real.'],
    UC: ['UC · Unidade de Controle', 'Coordena as etapas do ciclo, seleciona as transferências, controla leituras e escritas e avalia os saltos. Os sinais de controle são representados em violeta.'],
    ULA_OP: ['ULA_OP · Seleção da Operação', 'Recebe o código decodificado. Seleciona soma, subtração, operação lógica ou passagem de valor; instruções de salto e parada são realizadas pela unidade de controle.'],
    RULA_1: ['RULA₁ · Primeira Entrada', 'Guarda o primeiro valor usado pela ULA. Quando a origem é a memória, este modelo mostra a sequência RDM → ACC → RULA₁.'],
    RULA_2: ['RULA₂ · Segunda Entrada', 'Guarda o segundo valor usado pela ULA. Um valor lido da memória chega por RDM; um imediato vem de DI. Se for o ACC original, ele é preservado antes de carregar a primeira origem da memória.'],
    RULA_3: ['RULA₃ · Destino do Resultado', 'Guarda o endereço de destino ou a indicação ACC. É uma convenção desta arquitetura didática: não representa uma terceira entrada da ULA e não guarda o resultado do cálculo.'],
    ULA: ['ULA · Unidade Lógica e Aritmética', 'O bloco em Y recebe até duas entradas e calcula a operação selecionada. A saída segue para ACC. CMP atualiza apenas as flags e preserva o acumulador original.'],
    ACC: ['ACC · Acumulador', 'Armazena resultados e serve de passagem para o primeiro operando de memória. As operações com um único operando usam o ACC como primeira origem e destino.'],
    FLAGS: ['Flags · Z e N', 'Z vale 1 quando o resultado é zero. N vale 1 quando é negativo. Após CMP, Z indica igualdade e N indica que a primeira origem é menor. Saltos condicionais consultam essas flags.'],
    MP: ['MP · Memória Principal', 'Armazena instruções e dados nas mesmas 64 posições. REM seleciona um endereço; RDM transporta seu conteúdo. Instruções ocupam uma posição por convenção didática.']
  };
  const PHASES = ['','Buscar instrução','Atualizar CI','Decodificar','Buscar operandos','Executar','Armazenar'];
  const SHORT = ['','BUSCA','CI + 1','DECODE','OPERANDOS','EXECUÇÃO','ESCRITA'];
  let machine, running = false, timer, dirty = false, showAll = false, hex = false, editingAddress = null, autoCount = 0, toastTimer;
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const addr = n => `M${String(n).padStart(2,'0')}`;
  function number(v) { return typeof v === 'number' && hex ? `${v < 0 ? '−' : ''}0x${Math.abs(v).toString(16).toUpperCase()}` : String(v); }
  function value(key) {
    const s = machine.state, v = s[key];
    if (key === 'DI') return s.DI ? s.DI.opcode : '—';
    if (key === 'UC') return s.error ? 'falha' : s.halted ? 'parada' : machine.last ? PHASES[machine.last.phase].toLowerCase() : 'espera';
    if (key === 'FLAGS') return `Z = ${+s.flags.Z} · N = ${+s.flags.N}`;
    if (key === 'MP') return s.REM === null ? '64 posições' : `${addr(s.REM)} = ${s.memory[s.REM]}`;
    if (v === null || v === undefined) return '—';
    if (key === 'CI' || key === 'REM') return addr(v);
    if (key === 'RULA_3') return typeof v === 'number' ? addr(v) : v;
    return number(v);
  }
  function alert(message = '') { $('alert').hidden = !message; $('alert').textContent = message; }
  function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => {$('toast').hidden = true;}, 3500); }
  function stop() { running = false; clearTimeout(timer); updateControls(); }
  function updateControls() {
    if (!machine) return;
    const s = machine.state;
    $('play-label').textContent = running ? 'Pausar' : 'Executar';
    document.querySelector('.play-icon').textContent = running ? 'Ⅱ' : '▶';
    $('play').disabled = dirty || s.halted || !!s.error;
    $('step').disabled = running || dirty || s.halted || !!s.error;
    $('back').disabled = running || dirty || !machine.history.length;
    $('status').className = `status ${s.error ? 'error' : running ? 'running' : ''}`;
    $('status').innerHTML = `<i></i>${s.error ? 'Execução interrompida' : dirty ? 'Monte as alterações' : s.halted ? 'Programa concluído' : running ? 'Executando' : machine.total ? 'Simulação pausada' : 'Pronto para iniciar'}`;
    $('editor-state').textContent = dirty ? 'não montado' : 'carregado';
  }
  function lineNumbers() {
    const line = machine?.program.sourceMap[machine.state.instructionAddress];
    $('line-numbers').innerHTML = $('source').value.split('\n').map((_, i) => `<div class="${i + 1 === line && !dirty ? 'current' : ''}">${String(i + 1).padStart(2, '0')}</div>`).join('');
    $('line-numbers').scrollTop = $('source').scrollTop;
  }
  function mount(notify = true) {
    stop();
    try {
      const program = assemble($('source').value);
      machine = new Machine(program); dirty = false; editingAddress = null; $('memory-edit').hidden = true; alert();
      $('program-count').textContent = `${program.code.length} instruções`;
      try { localStorage.setItem('ciclo-cpu-source-v1', $('source').value); } catch {}
      render(); if (notify) toast('Programa montado. Comece pelo próximo passo.');
      return true;
    } catch (e) { dirty = true; alert(e.message); updateControls(); return false; }
  }
  function step() {
    if (dirty || !machine) return;
    const event = machine.next();
    if (!event) return;
    editingAddress = null; $('memory-edit').hidden = true;
    render();
    if (machine.state.error) { stop(); alert(machine.state.error); }
    else if (machine.state.halted) { stop(); toast(`Programa concluído · ${machine.state.completed} instruções · ${machine.total} micro-operações`); }
  }
  function play() {
    if (running) { stop(); return; }
    if (dirty || machine.state.halted || machine.state.error) return;
    running = true; autoCount = 0; updateControls();
    const tick = () => {
      if (!running) return;
      step(); autoCount++;
      if (autoCount >= 2000) { stop(); toast('Pausa após 2.000 passos. Você pode continuar ou revisar o laço.'); return; }
      if (running) timer = setTimeout(tick, Number($('speed').value));
    };
    tick();
  }
  function renderMemory() {
    const s = machine.state, last = machine.last;
    const list = showAll ? Array.from({length:64},(_,i)=>i) : [...new Set([...machine.program.used, ...s.memory.map((v,i)=>v !== 0 ? i : -1).filter(i=>i >= 0), ...(s.REM !== null ? [s.REM] : [])])].sort((a,b)=>a-b);
    $('memory-body').innerHTML = list.map(i => {
      const instruction = typeof s.memory[i] === 'string', changed = s.memory[i] !== machine.program.memory[i];
      const active = i === s.REM && last && (last.kind === 'read' || last.kind === 'write' || last.to.includes('REM'));
      const content = instruction ? esc(s.memory[i]) : `<button class="memory-value" data-address="${i}" aria-label="Editar ${addr(i)}, valor ${s.memory[i]}" ${machine.total || dirty ? 'disabled' : ''}>${esc(number(s.memory[i]))}</button>`;
      return `<tr data-memory="${i}" class="${instruction ? 'code-row' : ''} ${changed ? 'changed' : ''} ${active ? 'current-memory' : ''} ${active && last.kind === 'write' ? 'writing' : ''} ${i === s.CI ? 'next-instruction' : ''}"><td>${addr(i)}</td><td title="${esc(s.memory[i])}">${content}</td></tr>`;
    }).join('');
    if (last && ['read','write'].includes(last.kind)) {
      const row = document.querySelector(`[data-memory="${s.REM}"]`), container = document.querySelector('.memory-table-wrap');
      if (row) { const rr = row.getBoundingClientRect(), cr = container.getBoundingClientRect(); if (rr.bottom > cr.bottom || rr.top < cr.top + 28) container.scrollTop += rr.top - cr.top - 40; }
    }
    $('memory-help').textContent = dirty ? 'Monte as alterações antes de editar a memória.' : machine.total ? 'Reinicie para editar dados. Cores mostram leitura e escrita.' : 'Clique em um dado para editar antes de executar.';
  }
  const routes = {
    'CI:REM': 'M 182 129 H 212 V 75 H 559 V 90',
    'CI:CI': 'M 70 90 V 65 H 157 V 90',
    'REM:MP': 'M 623 129 H 708 V 174',
    'MP:RDM': 'M 661 246 H 623',
    'RDM:MP': 'M 623 256 H 661',
    'RDM:RI': 'M 494 246 H 251',
    'RI:DI': 'M 114 286 V 325',
    'DI:ULA_OP': 'M 182 365 H 266 V 381',
    'DI:REM': 'M 182 355 H 212 V 308 H 559 V 168',
    'RDM:ACC': 'M 559 286 V 308 H 480 V 460 H 464',
    'ACC:RDM': 'M 464 460 H 480 V 308 H 559 V 286',
    'ACC:RULA_1': 'M 319 465 H 290 V 75 H 338 V 90',
    'ACC:RULA_2': 'M 319 465 H 290 V 75 H 437 V 90',
    'RDM:RULA_2': 'M 494 246 H 480 V 75 H 437 V 90',
    'DI:RULA_1': 'M 182 350 H 290 V 75 H 338 V 90',
    'DI:RULA_2': 'M 182 350 H 290 V 75 H 437 V 90',
    'DI:RULA_3': 'M 114 403 V 419 H 620 V 474 H 616',
    'RULA_1:ULA': 'M 338 151 V 185',
    'RULA_2:ULA': 'M 437 151 V 185',
    'ULA_OP:ULA': 'M 319 410 H 335 V 300 H 349',
    'ULA:ACC': 'M 388 387 V 426',
    'ULA:FLAGS': 'M 420 358 H 509',
    'ACC:FLAGS': 'M 464 475 H 490 V 358 H 509',
    'RULA_3:REM': 'M 616 473 H 640 V 129 H 623',
    'DI:CI': 'M 46 364 H 31 V 129 H 46',
    'FLAGS:CI': 'M 615 360 H 640 V 59 H 114 V 90',
    'DI:UC': 'M 114 403 V 442',
    'UC:ULA_OP': 'M 182 473 H 266 V 442'
  };
  const colors = {data:'#79d3ed',read:'#79d3ed',write:'#c4ee83',control:'#b4a0f8',address:'#edbe78',execute:'#c4ee83',skip:'#7b8798'};
  function drawBase() {
    const selected = ['CI:REM','REM:MP','MP:RDM','RDM:RI','RI:DI','DI:ULA_OP','RDM:ACC','ACC:RULA_1','RDM:RULA_2','DI:RULA_3','RULA_1:ULA','RULA_2:ULA','ULA_OP:ULA','ULA:ACC','ULA:FLAGS','RULA_3:REM','DI:UC'];
    $('base-wires').innerHTML = selected.map(k=>`<path class="wire ${k.startsWith('DI:') || k.startsWith('ULA_OP:') ? 'control-wire' : ''}" d="${routes[k]}"/>`).join('');
  }
  function drawActive(event) {
    $('active-wires').innerHTML = '';
    document.querySelectorAll('[data-node]').forEach(el => el.classList.remove('active-source','active-target'));
    if (!event || event.error) return;
    const color = colors[event.kind]; $('diagram').style.setProperty('--flow-color', color);
    event.from.forEach(id => document.querySelector(`[data-node="${id}"]`)?.classList.add('active-source'));
    event.to.forEach(id => document.querySelector(`[data-node="${id}"]`)?.classList.add('active-target'));
    let pairs = [];
    if (event.kind === 'read') pairs = [['REM','MP','address'],['MP','RDM','read']];
    else if (event.kind === 'write') pairs = [['REM','MP','address'],['RDM','MP','write']];
    else if (event.kind === 'execute') { pairs = event.from.map(from=>[from,'ULA','execute']); if (event.to.includes('FLAGS')) pairs.push(['ULA','FLAGS','execute']); }
    else pairs = event.from.flatMap(from => event.to.map(to => [from,to,event.kind]));
    $('active-wires').innerHTML = pairs.map(([from,to,kind]) => {
      const d = routes[`${from}:${to}`];
      return d ? `<g style="color:${colors[kind]}"><path class="active-wire" d="${d}"/><path class="wire-flow" d="${d}"/></g>` : '';
    }).join('');
  }
  function render() {
    if (!machine) return;
    const s = machine.state, e = machine.last;
    document.querySelectorAll('[data-value]').forEach(el => { const content = value(el.dataset.value); el.textContent = content; el.title = content; });
    $('flag-z').textContent = +s.flags.Z; $('flag-z').classList.toggle('set', s.flags.Z);
    $('flag-n').textContent = +s.flags.N; $('flag-n').classList.toggle('set', s.flags.N);
    $('alu-symbol').textContent = SYMBOLS[s.ULA_OP] || (s.ULA_OP ? '—' : '+ / −');
    $('current-instruction').textContent = s.RI || 'Aguardando busca';
    $('instruction-address').textContent = s.instructionAddress !== null ? `origem ${addr(s.instructionAddress)}` : `CI → ${addr(s.CI)}`;
    $('acc-result').textContent = number(s.ACC);
    $('result-caption').textContent = s.halted ? 'Valor final do acumulador' : e?.kind === 'write' ? `Gravado em ${addr(s.REM)}: ${number(s.RDM)}` : machine.total ? 'Estado atual do acumulador' : 'O resultado aparece aqui';
    $('cycle-count').textContent = `${s.completed} ${s.completed === 1 ? 'instrução concluída' : 'instruções concluídas'}`;
    $('memory-signal').textContent = e?.kind === 'read' ? `lendo ${addr(s.REM)}` : e?.kind === 'write' ? `gravou ${addr(s.REM)}` : 'pronta';
    $('transfer-chip').textContent = e ? e.error ? 'Execução interrompida — consulte a mensagem' : e.rtl : 'Cada passo revela uma transferência';
    document.querySelectorAll('[data-phase]').forEach(el => { const phase = Number(el.dataset.phase); el.classList.toggle('active', phase === e?.phase); el.classList.toggle('passed', phase < e?.phase); if(phase === e?.phase) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current'); });
    $('step-kicker').textContent = e ? `${String(e.phase).padStart(2,'0')} / ${PHASES[e.phase].toUpperCase()}${e.kind === 'skip' ? ' · SEM TRANSFERÊNCIA' : ''}` : 'PRONTO PARA EXPLORAR';
    $('micro-count').textContent = `μ ${String(machine.total).padStart(3,'0')}`;
    $('step-rtl').textContent = e ? e.error ? 'Operação interrompida' : e.rtl : 'Uma instrução. Muitos movimentos.';
    $('step-explanation').textContent = e ? e.error || e.explanation : 'Clique em “Próximo passo” para ver o CI enviar o endereço da primeira instrução à memória. Cada clique executa uma micro-operação.';
    $('transfer-description').innerHTML = e ? e.from.length ? `<span>ORIGEM</span><b>${esc(e.from.join(' + '))}</b><i>→</i><span>DESTINO</span><b>${esc(e.to.join(' + '))}</b>` : '<span>NENHUM DADO TRANSFERIDO NESTA ETAPA</span>' : '<span>ORIGEM</span><b>CI</b><i>→</i><span>DESTINO</span><b>REM</b>';
    $('trace').innerHTML = machine.trace.length ? machine.trace.slice(-100).map((event,i,arr) => `<div class="trace-row ${i === arr.length - 1 ? 'latest' : ''} ${event.error ? 'error-row' : ''}"><span>${String(event.number).padStart(3,'0')}</span><span class="trace-phase">${SHORT[event.phase]}</span><code>${esc(event.rtl)}</code><span class="trace-value" title="${esc(event.value)}">${esc(event.error ? 'ERRO' : event.value)}</span></div>`).join('') : '<p class="trace-empty">As transferências entre registradores aparecerão aqui.<br><span>Use ← e → para navegar. Espaço para executar ou pausar.</span></p>';
    $('trace').scrollTop = $('trace').scrollHeight;
    drawActive(e); renderMemory(); lineNumbers(); updateControls();
  }
  function download(name, data, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([data], {type}), link = document.createElement('a'), url = URL.createObjectURL(blob);
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1500);
  }
  function openGuide() { stop(); $('guide').showModal(); }
  $('play').addEventListener('click', play);
  $('step').addEventListener('click', step);
  $('back').addEventListener('click', () => { stop(); machine.back(); alert(); render(); });
  $('reset').addEventListener('click', () => { stop(); machine.reset(); alert(); $('memory-edit').hidden = true; render(); toast(dirty ? 'Simulação reiniciada. Monte as alterações para executá-las.' : 'Registradores e memória restaurados.'); });
  $('assemble').addEventListener('click', () => mount());
  $('source').addEventListener('input', () => { stop(); dirty = true; $('memory-edit').hidden = true; updateControls(); lineNumbers(); renderMemory(); });
  $('source').addEventListener('scroll', () => {$('line-numbers').scrollTop = $('source').scrollTop;});
  $('source').addEventListener('keydown', event => {if(event.key === 'Tab') {event.preventDefault(); const el = event.target, start = el.selectionStart; el.setRangeText('  ', start, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input'));}});
  $('example').addEventListener('change', () => { const ex = EXAMPLES[$('example').value]; $('source').value = ex.source; $('example-note').innerHTML = ex.note; mount(); });
  $('memory-used').addEventListener('click', () => setMemoryView(false));
  $('memory-all').addEventListener('click', () => setMemoryView(true));
  function setMemoryView(all) {showAll = all; $('memory-used').classList.toggle('selected',!all); $('memory-all').classList.toggle('selected',all); $('memory-used').setAttribute('aria-pressed',String(!all)); $('memory-all').setAttribute('aria-pressed',String(all)); renderMemory();}
  $('format').addEventListener('click', () => {hex = !hex; $('format').textContent = hex ? 'HEX' : 'DEC'; render();});
  $('memory-body').addEventListener('click', event => {
    const el = event.target.closest('[data-address]'); if(!el || machine.total || dirty) return;
    editingAddress = Number(el.dataset.address); $('memory-edit').hidden = false; $('memory-edit-label').textContent = `Valor decimal em ${addr(editingAddress)}`; $('memory-value').value = machine.state.memory[editingAddress]; $('memory-value').focus(); $('memory-value').select();
  });
  $('memory-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      if(dirty) throw new Error('Monte as alterações antes de editar a memória.');
      const value = Number($('memory-value').value), target = editingAddress;
      machine.editMemory(target, value);
      const pattern = new RegExp(`^(\\s*M0*${target}\\s*:\\s*)#?-?\\d+`, 'im');
      const source = $('source').value;
      $('source').value = pattern.test(source) ? source.replace(pattern, (_, prefix) => `${prefix}${value}`) : `${source.trimEnd()}\nM${target}: ${value}`;
      mount(false); toast('Dado atualizado na memória e no código do programa.');
    }
    catch(e) {alert(e.message);}
  });
  $('memory-cancel').addEventListener('click', () => {$('memory-edit').hidden = true; editingAddress = null;});
  $('guide-button').addEventListener('click', openGuide);
  document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => $(el.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {if(event.target === dialog) {const r = dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();}}));
  document.querySelectorAll('[data-node]').forEach(el => el.addEventListener('click', () => {
    stop(); const key = el.dataset.node; $('register-title').textContent = INFO[key][0]; $('register-description').textContent = INFO[key][1];
    $('register-current').textContent = key === 'DI' && machine.state.DI ? `${machine.state.DI.opcode} | ${machine.state.DI.args.map(o=>o.text).join(' | ')}` : value(key); $('register-info').showModal();
  }));
  $('presentation').addEventListener('click', () => {document.body.classList.toggle('presentation'); const active = document.body.classList.contains('presentation'); $('presentation').innerHTML = `⛶ <span>${active ? 'Sair do modo aula' : 'Modo aula'}</span>`; $('presentation').setAttribute('aria-pressed',String(active));});
  $('export').addEventListener('click', () => download('programa.asm', $('source').value));
  $('import').addEventListener('click', () => {stop(); $('import-file').click();});
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if(!file) return;
    if(file.size > 128000) {alert('O arquivo deve ter até 128 KB.'); return;}
    try {$('source').value = await file.text(); $('example-note').textContent = 'Programa importado. Confira os operandos e acompanhe cada ciclo.'; mount();} catch(e) {alert(`Não foi possível ler o arquivo: ${e.message}`);} finally {event.target.value = '';}
  });
  $('export-trace').addEventListener('click', () => {
    if(!machine.trace.length) {toast('Execute um passo antes de exportar o rastro.'); return;}
    const s = machine.state;
    const report = ['CICLO CPU — Rastro de execução (LTR)', 'Arquitetura didática · inteiros de 32 bits · 64 posições', '', 'PROGRAMA MONTADO', machine.program.source, '', 'MEMÓRIA INICIAL (DADOS)', ...machine.program.memory.map((v,i)=> typeof v === 'number' && (v !== 0 || machine.program.used.includes(i)) ? `${addr(i)}: ${v}` : null).filter(Boolean), '', `MICRO-OPERAÇÕES (últimas ${machine.trace.length} de ${machine.total})`, ...machine.trace.map(e=>`${String(e.number).padStart(4,'0')} | ${PHASES[e.phase]} | ${e.rtl} | ${e.error || e.explanation}`), '', 'ESTADO ATUAL', `CI=${s.CI} ACC=${s.ACC} Z=${+s.flags.Z} N=${+s.flags.N}`, `Instruções concluídas: ${s.completed}`, `Estado: ${s.error || (s.halted ? 'HLT' : 'pausado')}`, '', 'MEMÓRIA ATUAL', ...s.memory.map((v,i)=>`${addr(i)}: ${v}`)].join('\n');
    download('rastro-ciclo-cpu.txt', report);
  });
  document.addEventListener('keydown', event => {
    if(document.querySelector('dialog[open]') || event.ctrlKey || event.altKey || event.metaKey || ['TEXTAREA','INPUT','SELECT','BUTTON','A'].includes(event.target.tagName)) return;
    if(event.code === 'Space') {event.preventDefault(); play();}
    if(event.key === 'ArrowRight') {event.preventDefault(); if(!running) step();}
    if(event.key === 'ArrowLeft') {event.preventDefault(); if(!running && !dirty) {machine.back(); alert(); render();}}
  });
  document.addEventListener('visibilitychange', () => {if(document.hidden && running) stop();});
  drawBase();
  let saved;
  try {saved = localStorage.getItem('ciclo-cpu-source-v1');} catch {}
  $('source').value = saved || EXAMPLES.add.source;
  $('example-note').innerHTML = saved && saved !== EXAMPLES.add.source ? 'Seu último programa montado foi recuperado. Use os exemplos para explorar outras operações.' : EXAMPLES.add.note;
  if (!mount(false)) {$('source').value = EXAMPLES.add.source; mount(false);}
})();
