(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CPULab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SIZE = 64;
  const MIN = -2147483648, MAX = 2147483647;
  const BINARY = ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'AND', 'OR', 'XOR', 'SHL', 'SHR'];
  const JUMPS = ['JMP', 'JZ', 'JNZ', 'JE', 'JNE', 'JG', 'JL', 'JGE', 'JLE'];
  const SYMBOLS = {ADD: '+', SUB: '−', MUL: '×', DIV: '÷', MOD: '%', AND: 'AND', OR: 'OR', XOR: 'XOR', SHL: '<<', SHR: '>>', CMP: '−', MOV: '→', LOAD: '→', STORE: '→', NOT: 'NOT', INC: '+', DEC: '−'};
  function integer(value) {
    if (!Number.isInteger(value) || value < MIN || value > MAX) throw new Error('O valor deve ser um inteiro de 32 bits (−2147483648 a 2147483647).');
    return value;
  }
  function address(value) {
    if (!Number.isInteger(value) || value < 0 || value >= SIZE) throw new Error('Endereço fora da memória: use M0 a M63.');
    return value;
  }
  function operand(token, labels = {}) {
    const t = String(token || '').toUpperCase();
    if (t === 'ACC') return {type: 'acc', text: 'ACC'};
    if (/^M\d+$/.test(t)) return {type: 'mem', value: address(Number(t.slice(1))), text: t};
    if (/^#?-?\d+$/.test(t)) return {type: 'imm', value: integer(Number(t.replace('#', ''))), text: t};
    if (Object.hasOwn(labels, t)) return {type: 'imm', value: labels[t], text: t};
    throw new Error(`Operando inválido: “${token || ''}”. Use M13, #5 ou ACC.`);
  }
  function destination(op) {
    if (!op || !['mem', 'acc'].includes(op.type)) throw new Error('O destino precisa ser uma posição de memória (M0…M63) ou ACC.');
    return op;
  }
  function decode(text, labels = {}) {
    const words = text.toUpperCase().replaceAll(',', ' ').trim().split(/\s+/);
    const opcode = words.shift(), args = words.map(t => operand(t, labels));
    const need = n => { if (args.length !== n) throw new Error(`${opcode} espera ${n} operando(s); recebeu ${args.length}.`); };
    const d = {opcode, args, text: [opcode, ...words].join(' '), a: null, b: null, dest: null};
    if (BINARY.includes(opcode)) {
      if (args.length === 1) { d.a = operand('ACC'); d.b = args[0]; d.dest = operand('ACC'); }
      else { need(3); [d.a, d.b, d.dest] = args; destination(d.dest); }
    } else if (opcode === 'INC' || opcode === 'DEC') {
      need(1); d.a = args[0]; d.b = operand('#1'); d.dest = destination(args[0]);
    } else if (opcode === 'NOT') {
      need(2); [d.a, d.dest] = args; destination(d.dest);
    } else if (opcode === 'LOAD') { need(1); d.a = args[0]; d.dest = operand('ACC'); }
    else if (opcode === 'STORE') { need(1); d.a = operand('ACC'); d.dest = destination(args[0]); if (d.dest.type !== 'mem') throw new Error('STORE exige um endereço de memória.'); }
    else if (opcode === 'MOV') { need(2); [d.a, d.dest] = args; destination(d.dest); }
    else if (opcode === 'CMP') { need(2); [d.a, d.b] = args; }
    else if (JUMPS.includes(opcode)) { need(1); if (args[0].type === 'acc') throw new Error('O salto exige um rótulo ou endereço.'); d.target = address(args[0].value); }
    else if (opcode === 'NOP' || opcode === 'HLT') need(0);
    else throw new Error(`Instrução desconhecida: ${opcode}. Consulte o guia de instruções.`);
    return d;
  }
  function assemble(source) {
    const memory = Array(SIZE).fill(0), used = new Set(), code = new Set(), sourceMap = {}, labels = Object.create(null), instructions = [], data = [];
    let pc = 0;
    const lines = source.replaceAll('\r', '').split('\n');
    lines.forEach((raw, i) => {
      let line = raw.split(';')[0].trim();
      if (!line) return;
      const dataMatch = line.match(/^(M\d+)\s*:\s*(#?-?\d+)$/i);
      if (dataMatch) { data.push({addr: address(Number(dataMatch[1].slice(1))), value: integer(Number(dataMatch[2].replace('#', ''))), line: i + 1}); return; }
      const match = line.match(/^([A-Z_][A-Z_0-9]*)\s*:\s*/i);
      if (match) {
        const name = match[1].toUpperCase();
        if (/^M\d+$/.test(name) || name === 'ACC' || Object.hasOwn(labels, name)) throw new Error(`Linha ${i + 1}: rótulo inválido ou repetido (${name}).`);
        labels[name] = pc; line = line.slice(match[0].length).trim();
        if (!line) return;
      }
      if (pc >= SIZE) throw new Error('O programa excede as 64 posições de memória.');
      instructions.push({text: line, addr: pc, line: i + 1}); sourceMap[pc] = i + 1; pc++;
    });
    if (!instructions.length) throw new Error('Escreva pelo menos uma instrução. Experimente ADD M13 M15 M21 e HLT.');
    instructions.forEach(item => {
      try {
        const d = decode(item.text, labels);
        memory[item.addr] = d.text; used.add(item.addr); code.add(item.addr);
        d.args.filter(o => o.type === 'mem').forEach(o => used.add(o.value));
      } catch (e) { throw new Error(`Linha ${item.line}: ${e.message}`); }
    });
    const initialized = new Set();
    data.forEach(item => {
      if (code.has(item.addr) || initialized.has(item.addr)) throw new Error(`Linha ${item.line}: M${item.addr} já está ocupada por uma instrução ou dado.`);
      memory[item.addr] = item.value; used.add(item.addr); initialized.add(item.addr);
    });
    return {memory, used: [...used].sort((a, b) => a - b), code: [...code], sourceMap, labels, source};
  }
  function numeric(s, addr) {
    const v = s.memory[address(addr)];
    if (typeof v !== 'number') throw new Error(`M${addr} contém uma instrução, não um operando numérico.`);
    return v;
  }
  function flags(s, v) { s.flags.Z = v === 0; s.flags.N = v < 0; }
  function calc(op, a, b) {
    let n;
    switch (op) {
      case 'ADD': case 'INC': n = a + b; break;
      case 'SUB': case 'DEC': n = a - b; break;
      case 'MUL': n = a * b; break;
      case 'DIV': if (!b) throw new Error('Divisão por zero. Altere o segundo operando.'); n = Math.trunc(a / b); break;
      case 'MOD': if (!b) throw new Error('Resto de divisão por zero.'); n = a % b; break;
      case 'AND': n = a & b; break;
      case 'OR': n = a | b; break;
      case 'XOR': n = a ^ b; break;
      case 'NOT': n = ~a; break;
      case 'SHL': case 'SHR':
        if (b < 0 || b > 31) throw new Error('O deslocamento deve estar entre 0 e 31 bits.');
        n = op === 'SHL' ? a * 2 ** b : a >> b; break;
      default: n = a;
    }
    if (!Number.isInteger(n) || n < MIN || n > MAX) throw new Error('Overflow: o resultado não cabe em um inteiro de 32 bits.');
    return n === 0 ? 0 : n;
  }
  class Machine {
    constructor(program) { this.program = program; this.reset(); }
    reset() {
      this.state = {CI: 0, REM: null, RDM: null, RI: null, DI: null, ULA_OP: null, RULA_1: null, RULA_2: null, RULA_3: null, ULA: null, ACC: 0, flags: {Z: false, N: false}, memory: [...this.program.memory], halted: false, error: null, completed: 0, instructionAddress: null};
      this.queue = []; this.cursor = 0; this.history = []; this.trace = []; this.total = 0; this.last = null;
    }
    editMemory(addr, value) {
      if (this.total) throw new Error('Reinicie a simulação antes de editar a memória.');
      address(addr); integer(value);
      if (typeof this.state.memory[addr] === 'string') throw new Error('Edite as instruções no programa e clique em Montar.');
      this.state.memory[addr] = value; this.program.memory[addr] = value;
      if (!this.program.used.includes(addr)) this.program.used.push(addr);
    }
    buildQueue() {
      const s = this.state, steps = [];
      const add = (phase, rtl, explanation, from, to, run, kind = 'data') => steps.push({phase, rtl, explanation, from, to, run, kind});
      const skip = (phase, text) => add(phase, '— etapa dispensada —', text, [], [], () => {}, 'skip');
      add(1, 'REM ← (CI)', 'O endereço da próxima instrução sai do Contador de Instrução e entra no Registrador de Endereço da Memória.', ['CI'], ['REM'], s => { s.instructionAddress = address(s.CI); s.REM = s.CI; }, 'address');
      add(1, 'RDM ← MP[REM]', 'A memória lê a posição apontada por REM e envia a instrução ao Registrador de Dados da Memória.', ['MP', 'REM'], ['RDM'], s => { const word = s.memory[address(s.REM)]; if (typeof word !== 'string') throw new Error(`M${s.REM} contém um dado. Inclua HLT ao final do programa ou corrija o salto.`); s.RDM = word; }, 'read');
      add(1, 'RI ← (RDM)', 'A instrução lida é copiada para o Registrador de Instrução. Ela permanece em RI durante este ciclo.', ['RDM'], ['RI'], s => { s.RI = s.RDM; });
      add(2, 'CI ← (CI) + 1', 'Cada instrução ocupa uma posição neste modelo. O CI passa a apontar para a próxima; um salto poderá alterá-lo depois.', ['CI'], ['CI'], s => { s.CI++; }, 'address');
      add(3, 'DI ← (RI)', 'O decodificador separa o código da operação e seus operandos. A unidade de controle passa a coordenar as transferências.', ['RI'], ['DI'], s => { s.DI = decode(s.RI, this.program.labels); }, 'control');
      add(3, 'ULA_OP ← DI(Cód.Op)', 'O código de operação seleciona a função da ULA ou a ação de controle da instrução.', ['DI'], ['ULA_OP'], s => { s.ULA_OP = s.DI.opcode; s.RULA_1 = null; s.RULA_2 = null; s.RULA_3 = null; s.ULA = null; }, 'control');
      this.queue = steps; this.cursor = 0;
    }
    extendQueue(d) {
      const steps = this.queue;
      const add = (phase, rtl, explanation, from, to, run, kind = 'data') => steps.push({phase, rtl, explanation, from, to, run, kind});
      const skip = (phase, text) => add(phase, '— etapa dispensada —', text, [], [], () => {}, 'skip');
      const entryACC = this.state.ACC;
      const read = (op, i) => {
        const target = i === 1 ? 'RULA_1' : 'RULA_2', display = i === 1 ? 'RULA₁' : 'RULA₂';
        if (op.type === 'mem') {
          add(4, `REM ← DI(Op.${i})`, `O endereço ${op.text} do operando ${i} é colocado em REM.`, ['DI'], ['REM'], s => { s.REM = op.value; }, 'address');
          add(4, 'RDM ← MP[REM]', `A memória entrega o conteúdo de ${op.text}, que é um valor, e não seu endereço.`, ['MP', 'REM'], ['RDM'], s => { s.RDM = numeric(s, s.REM); }, 'read');
          if (i === 1) {
            add(4, 'ACC ← (RDM)', 'Neste modelo didático, o primeiro operando passa pelo acumulador antes de entrar na ULA.', ['RDM'], ['ACC'], s => { s.ACC = s.RDM; });
            add(4, 'RULA₁ ← (ACC)', 'A primeira entrada da ULA recebe o valor do acumulador.', ['ACC'], ['RULA_1'], s => { s.RULA_1 = s.ACC; });
          } else add(4, `${display} ← (RDM)`, 'A segunda entrada da ULA recebe o segundo operando lido na memória.', ['RDM'], [target], s => { s[target] = s.RDM; });
        } else if (op.type === 'acc') {
          add(4, `${display} ← (ACC${i === 2 && d.a?.type === 'mem' ? ' de entrada' : ''})`, 'O operando já está no acumulador; não é necessária uma leitura de memória. Usa o ACC do início da instrução.', ['ACC'], [target], s => { s[target] = entryACC; });
        } else add(4, `${display} ← DI(Op.${i})`, `O valor imediato ${op.value} vem da própria instrução. Não há leitura adicional da memória.`, ['DI'], [target], s => { s[target] = op.value; });
      };
      if (d.a) {
        if (d.b?.type === 'acc' && d.a.type === 'mem') { read(d.b, 2); read(d.a, 1); }
        else { read(d.a, 1); if (d.b) read(d.b, 2); }
      } else skip(4, 'Esta instrução não precisa buscar operandos na memória.');
      if (d.dest) add(4, `RULA₃ ← ${d.args.length === 3 ? 'DI(Op.3)' : 'destino'}`, `RULA₃ guarda o destino (${d.dest.text}). Ele não é uma terceira entrada aritmética da ULA.`, ['DI'], ['RULA_3'], s => { s.RULA_3 = d.dest.type === 'mem' ? d.dest.value : 'ACC'; }, 'address');
      if (JUMPS.includes(d.opcode)) {
        add(5, `${d.opcode} → CI`, 'A unidade de controle avalia as flags Z e N. Quando a condição é verdadeira, o CI recebe o endereço do salto.', ['DI', 'FLAGS'], ['CI'], s => {
          const {Z, N} = s.flags;
          const take = {JMP: true, JZ: Z, JE: Z, JNZ: !Z, JNE: !Z, JG: !Z && !N, JL: N, JGE: !N, JLE: N || Z}[d.opcode];
          if (take) s.CI = d.target;
        }, 'control');
        skip(6, 'Saltos alteram o CI. Nenhum resultado é gravado na memória.');
      } else if (d.opcode === 'NOP' || d.opcode === 'HLT') {
        add(5, d.opcode === 'HLT' ? 'UC ← parada' : 'NOP', d.opcode === 'HLT' ? 'A unidade de controle reconhece a parada. A simulação encerra ao concluir este ciclo.' : 'Nenhum dado é alterado. O processador apenas conclui esta instrução.', ['DI'], ['UC'], () => {}, 'control');
        add(6, '— sem escrita na MP —', 'Esta instrução não armazena resultado.', [], [], s => { if (d.opcode === 'HLT') s.halted = true; }, 'skip');
      } else if (d.opcode === 'CMP') {
        add(5, 'Flags ← comparar(RULA₁, RULA₂)', 'A ULA compara os operandos: Z = 1 se iguais; N = 1 se o primeiro for menor. CMP não armazena o resultado da subtração.', ['RULA_1', 'RULA_2', 'ULA_OP'], ['ULA', 'FLAGS'], s => { s.ULA = s.RULA_1 - s.RULA_2; flags(s, s.ULA); s.ACC = entryACC; }, 'execute');
        skip(6, 'CMP atualiza apenas as flags. O acumulador original é preservado e não há escrita na MP.');
      } else {
        add(5, `ULA ← ${d.b ? `RULA₁ ${SYMBOLS[d.opcode]} RULA₂` : d.opcode === 'NOT' ? 'NOT RULA₁' : 'RULA₁'}`, 'A ULA realiza a operação selecionada usando os valores das entradas. O resultado aparece na saída da ULA.', [d.a ? 'RULA_1' : null, d.b ? 'RULA_2' : null, 'ULA_OP'].filter(Boolean), ['ULA'], s => { s.ULA = calc(d.opcode, s.RULA_1, s.RULA_2); }, 'execute');
        add(5, 'ACC ← (ULA)', 'O resultado entra no acumulador. Operações aritméticas e lógicas também atualizam Z (zero) e N (negativo).', ['ULA'], ['ACC', ...(BINARY.includes(d.opcode) || ['INC', 'DEC', 'NOT'].includes(d.opcode) ? ['FLAGS'] : [])], s => { s.ACC = s.ULA; if (BINARY.includes(d.opcode) || ['INC', 'DEC', 'NOT'].includes(d.opcode)) flags(s, s.ACC); });
        if (d.dest.type === 'mem') {
          add(6, 'REM ← (RULA₃)', 'O endereço de destino guardado em RULA₃ é enviado a REM para preparar a escrita.', ['RULA_3'], ['REM'], s => { s.REM = s.RULA_3; }, 'address');
          add(6, 'RDM ← (ACC)', 'O resultado sai do acumulador e entra em RDM, que carrega o dado que será escrito.', ['ACC'], ['RDM'], s => { s.RDM = s.ACC; });
          add(6, 'MP[REM] ← (RDM)', 'A memória grava o valor de RDM na posição indicada por REM. O ciclo da instrução está completo.', ['RDM', 'REM'], ['MP'], s => { s.memory[address(s.REM)] = s.RDM; }, 'write');
        } else skip(6, 'O destino é ACC, que já recebeu o resultado. Não há escrita na memória principal.');
      }
    }
    next() {
      if (this.state.halted || this.state.error) return null;
      const before = {state: structuredClone(this.state), queue: [...this.queue], cursor: this.cursor, last: this.last, total: this.total};
      this.history.push(before);
      if (this.history.length > 1000) this.history.shift();
      if (!this.queue.length || this.cursor >= this.queue.length) this.buildQueue();
      const item = this.queue[this.cursor++];
      try {
        item.run(this.state);
        if (this.cursor === 6) this.extendQueue(this.state.DI);
        if (this.cursor === this.queue.length) this.state.completed++;
      } catch (e) { this.state = structuredClone(before.state); this.state.error = e.message; }
      this.total++;
      const {run, ...event} = item;
      this.last = {...event, number: this.total, instruction: this.state.instructionAddress, error: this.state.error, value: event.to.map(k => k === 'MP' ? this.state.memory[this.state.REM] : k === 'FLAGS' ? `Z=${+this.state.flags.Z} N=${+this.state.flags.N}` : k === 'DI' ? this.state.DI?.opcode : k === 'UC' ? this.state.ULA_OP : this.state[k]).filter(v => v !== undefined).join(' · ')};
      this.trace.push(this.last);
      if (this.trace.length > 1000) this.trace.shift();
      return this.last;
    }
    back() {
      const before = this.history.pop();
      if (!before) return false;
      Object.assign(this, before); this.trace.pop(); return true;
    }
  }
  return {Machine, assemble, decode, SIZE, MIN, MAX, SYMBOLS, BINARY, JUMPS};
});
