const test = require('node:test');
const assert = require('node:assert/strict');
const {Machine, assemble} = require('./engine.js');

function run(source, max = 3000) {
  const m = new Machine(assemble(source));
  while (!m.state.halted && !m.state.error && m.total < max) m.next();
  assert.equal(m.state.error, null, m.state.error || '');
  assert.ok(m.state.halted, 'O programa deve terminar com HLT');
  return m;
}
test('ADD M13 M15 M21 percorre as seis etapas, preserva origens e grava 12', () => {
  const m = run('ADD M13 M15 M21\nHLT\nM13: 7\nM15: 5\nM21: 0');
  assert.equal(m.state.memory[21], 12);
  assert.equal(m.state.memory[13], 7);
  assert.equal(m.state.memory[15], 5);
  assert.equal(m.state.ACC, 12);
  assert.equal(m.state.CI, 2);
  assert.equal(m.state.completed, 2);
  const first = m.trace.filter(e => e.instruction === 0);
  assert.deepEqual([...new Set(first.map(e=>e.phase))], [1,2,3,4,5,6]);
  assert.deepEqual(first.slice(0,6).map(e=>e.rtl), ['REM ← (CI)','RDM ← MP[REM]','RI ← (RDM)','CI ← (CI) + 1','DI ← (RI)','ULA_OP ← DI(Cód.Op)']);
  assert.ok(first.some(e=>e.rtl === 'ACC ← (RDM)'));
  assert.equal(first.at(-1).rtl, 'MP[REM] ← (RDM)');
});
test('Voltar desfaz escrita e reproduz a mesma micro-operação', () => {
  const m = new Machine(assemble('ADD M13 M15 M21\nHLT\nM13: 7\nM15: 5'));
  while(m.last?.kind !== 'write') m.next();
  const final = structuredClone(m.state);
  assert.equal(final.memory[21],12);
  m.back(); assert.equal(m.state.memory[21],0);
  m.next(); assert.deepEqual(m.state,final);
  while(m.history.length) m.back();
  assert.equal(m.total,0); assert.equal(m.state.CI,0); assert.equal(m.state.memory[21],0);
  assert.equal(m.state.RI,null); assert.equal(m.trace.length,0);
});
test('Laço com CMP e JL soma 1 até 5, preservando ACC em CMP', () => {
  const m = run('MOV #0 M30\nMOV #1 M31\nrepetir: ADD M30 M31 M30\nINC M31\nCMP M31 #6\nJL repetir\nHLT');
  assert.equal(m.state.memory[30],15); assert.equal(m.state.memory[31],6);
  assert.equal(m.state.flags.Z,true); assert.equal(m.state.flags.N,false);
  assert.equal(m.state.completed,23);
});
test('Imediatos não fazem leitura de operandos na MP e destino ACC dispensa escrita', () => {
  const m = run('LOAD #10\nADD #5\nMUL #2\nSTORE M25\nHLT');
  assert.equal(m.state.memory[25],30);
  assert.equal(m.trace.filter(e=>e.kind === 'read').length,5);
  assert.equal(m.trace.filter(e=>e.kind === 'write').length,1);
});
test('Operações binárias, lógicas e deslocamentos', () => {
  for(const [op,a,b,expected] of [['ADD',2,3,5],['SUB',2,7,-5],['MUL',-2,3,-6],['DIV',-9,2,-4],['MOD',-9,2,-1],['AND',12,10,8],['OR',12,10,14],['XOR',12,10,6],['SHL',8,2,32],['SHR',-8,2,-2]]) {
    assert.equal(run(`${op} #${a} #${b} M40\nHLT`).state.memory[40],expected,op);
  }
});
test('NOT, INC, DEC, MOV, NOP e formas de acumulador', () => {
  const m = run('MOV #5 M30\nINC M30\nDEC M30\nNOT M30 M31\nLOAD M31\nADD #10\nSUB #1\nNOP\nHLT');
  assert.equal(m.state.memory[30],5); assert.equal(m.state.memory[31],-6); assert.equal(m.state.ACC,3);
});
test('Segundo operando ACC é capturado antes de carregar origem da memória', () => {
  const m = run('LOAD #100\nSUB M20 ACC M21\nHLT\nM20: 7');
  assert.equal(m.state.memory[21],-93);
  const sequence = m.trace.filter(e=>e.instruction === 1).map(e=>e.rtl);
  assert.ok(sequence.indexOf('RULA₂ ← (ACC de entrada)') < sequence.indexOf('ACC ← (RDM)'));
});
test('CMP preserva ACC e não grava a subtração', () => {
  const m = run('LOAD #99\nCMP M20 #5\nHLT\nM20: 2');
  assert.equal(m.state.ACC,99); assert.equal(m.state.flags.N,true); assert.equal(m.state.memory[20],2);
});
test('Saltos condicionais: verdadeiros e falsos, igualdade e sinal', () => {
  for(const [op,a,b,take] of [['JZ',1,1,true],['JE',1,2,false],['JNZ',1,2,true],['JNE',1,1,false],['JG',3,2,true],['JG',1,2,false],['JL',1,2,true],['JL',2,1,false],['JGE',2,2,true],['JGE',1,2,false],['JLE',1,2,true],['JLE',3,2,false],['JMP',0,0,true]]) {
    const m = run(`CMP #${a} #${b}\n${op} destino\nMOV #42 M30\ndestino: HLT`);
    assert.equal(m.state.memory[30], take ? 0 : 42,op);
  }
});
test('Montagem rejeita conflitos, opcode inválido, quantidade errada e destino imediato', () => {
  for(const code of ['HLT\nM0: 7','ADD M13 M15 #2','BAD #3','ADD M13 M15','LOAD M64','M13: 1\nM13: 2\nHLT','x: NOP\nx: HLT','JMP inexistente']) assert.throws(()=>assemble(code),code);
});
test('Divisão por zero, overflow, código tratado como dado e execução de dado falham sem escrita', () => {
  for(const source of ['DIV #4 #0 M20\nHLT','ADD #2147483647 #1 M20\nHLT','LOAD M0\nHLT','JMP M30\nHLT','SHL #1 #32 M20\nHLT']) {
    const m = new Machine(assemble(source));
    for(let i=0;i<100 && !m.state.error;i++) m.next();
    assert.ok(m.state.error,source); assert.equal(m.state.memory[20],0);
    m.back(); assert.equal(m.state.error,null);
  }
});
test('Editar dado antes da execução atualiza reset; editar durante é rejeitado', () => {
  const m = new Machine(assemble('LOAD M13\nHLT\nM13: 7'));
  m.editMemory(13,23); m.next(); assert.throws(()=>m.editMemory(13,9)); m.reset(); assert.equal(m.state.memory[13],23);
});
test('Parser aceita minúsculas, vírgulas, comentários e rótulo em linha própria', () => {
  const m = run('; exemplo\ninicio:\nadd #2, #3, m20 ; soma\nhlt'); assert.equal(m.state.memory[20],5);
});
test('Histórico limitado mantém avanço e retrocesso consistentes', () => {
  const m = new Machine(assemble('inicio: INC M30\nJMP inicio'));
  for(let i=0;i<1200;i++) m.next();
  assert.equal(m.history.length,1000); const saved = structuredClone(m.state);
  m.back(); m.next(); assert.deepEqual(m.state,saved);
});
