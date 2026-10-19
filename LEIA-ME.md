# Ciclo CPU — Laboratório do Professor Rafael

Uma ferramenta didática em HTML, CSS e JavaScript para visualizar o ciclo de instrução por dentro do processador.

## Abrir

**Dê dois cliques em `index.html`.** Abra no Edge, Chrome ou Firefox atualizado. Mantenha `styles.css`, `engine.js` e `app.js` na mesma pasta do HTML.

Não precisa de instalação, terminal, Python, internet ou servidor. Todos os arquivos do aplicativo são locais. Use zoom do navegador e o botão **Modo aula** para projetar o diagrama.

## Começo rápido

1. O exemplo inicial contém `ADD M13 M15 M21` e `HLT`, com M13 = 7 e M15 = 5.
2. Clique em **Próximo passo**. Cada clique executa uma micro-operação e destaca sua origem, destino e caminho.
3. Leia a explicação e o rastro LTR abaixo do diagrama.
4. Na etapa 5, a ULA soma 7 + 5. Na etapa 6, a memória M21 recebe 12.
5. Use **Voltar** para desfazer a última micro-operação, inclusive uma escrita na memória.
6. Use **Executar** para avançar automaticamente; ajuste o ritmo e pause quando desejar.

As seis etapas são: buscar a instrução; incrementar CI; decodificar; buscar operandos; executar; armazenar quando necessário. Etapas dispensadas aparecem explicitamente.

## Editar e guardar programas

- Escreva no editor e clique em **Montar programa**. A montagem reinicia a CPU.
- Antes de executar, clique em um valor numérico da MP para editá-lo. A alteração também atualiza a declaração do dado no código.
- Reiniciar restaura os dados iniciais do programa montado. Para editar após uma execução, reinicie primeiro.
- Use os botões ao lado de Montar para baixar e abrir arquivos `.asm`.
- O último programa montado é guardado no armazenamento local do navegador quando disponível. O arquivo baixado é a forma recomendada de preservar seu trabalho.
- **Exportar rastro** baixa um relatório de texto com programa, memória inicial, últimas 1.000 micro-operações e estado final.
- **Em uso / Todas** alterna as posições da MP. **DEC / HEX** alterna a representação dos dados; endereços continuam com a notação decimal M00…M63.
- Clique em qualquer bloco para consultar sua função e conteúdo.
- Atalhos fora dos campos e botões: → avança; ← volta; Espaço executa/pausa. A execução pausa ao sair da aba.

## Assembly desta ferramenta

É uma **arquitetura educacional própria**. Não executa programas x86, ARM nem o conjunto de instruções do site de referência. O editor, a execução controlada e a inspeção de memória foram inspirados conceitualmente em https://schweigi.github.io/assembler-simulator/ . O código e o diagrama deste projeto são próprios.

### Sintaxe

```asm
; Comentários começam com ponto e vírgula
ADD M13 M15 M21   ; MP[21] = MP[13] + MP[15]
HLT              ; encerrar

M13: 7           ; conteúdo inicial da memória
M15: 5
M21: 0
```

`M13` é endereço, `#5` é imediato e `ACC` é acumulador. Números imediatos também aceitam a forma `5`. Maiúsculas/minúsculas e vírgulas opcionais são aceitas. Rótulos podem aparecer sozinhos ou antes de uma instrução.

| Operação | Sintaxe e significado |
| --- | --- |
| ADD, SUB, MUL, DIV, MOD | `ADD origem1 origem2 destino` |
| AND, OR, XOR, SHL, SHR | `AND origem1 origem2 destino` |
| Forma abreviada binária | `ADD origem`: ACC recebe ACC + origem |
| NOT | `NOT origem destino`: inverte os bits |
| LOAD | `LOAD origem`: carrega ACC |
| STORE | `STORE M21`: escreve ACC na memória |
| MOV | `MOV origem destino`: copia, passando por ACC |
| INC, DEC | `INC destino`: incrementa/decrementa o próprio destino |
| CMP | `CMP origem1 origem2`: compara e preserva ACC |
| JMP | `JMP rotulo` ou `JMP M2`: altera CI |
| JZ / JE | Salta se Z = 1 |
| JNZ / JNE | Salta se Z = 0 |
| JG, JL, JGE, JLE | Após CMP: maior, menor, maior/igual, menor/igual |
| NOP, HLT | Nenhuma operação; parar |

Os destinos de cálculos e MOV podem ser memória ou ACC. STORE exige memória. Saltos recebem endereço ou rótulo, nunca o conteúdo da posição. Sempre termine o programa com HLT ou um salto intencional.

### Convenções para explicar em aula

- A MP tem 64 posições compartilhadas por instruções e dados. Instruções são representadas simbolicamente, e cada uma ocupa uma posição. Portanto, CI aumenta 1.
- Os dados são inteiros com sinal de 32 bits. DIV trunca em direção a zero; MOD mantém o sinal do dividendo. SHR é aritmético. SHL rejeita overflow. Contagens de deslocamento vão de 0 a 31.
- Overflow, divisão por zero, execução de dados e leitura de instrução como número geram mensagens e interrompem a simulação sem aplicar a micro-operação que falhou.
- O CI pode chegar a 64 após buscar HLT em M63; uma nova busca fora da memória é inválida.
- Z indica zero e N indica negativo. Aritmética, lógica e CMP atualizam as flags. MOV, LOAD, STORE e controle preservam as flags.
- RULA₁ e RULA₂ são entradas. RULA₃ guarda o **destino**, não uma terceira entrada aritmética. O resultado aparece na saída da ULA e depois em ACC.
- Para dar sentido a `RULA₁ ← ACC` do roteiro, o primeiro operando de memória percorre `RDM → ACC → RULA₁`.
- Quando a segunda origem é ACC e a primeira está na memória, o ACC original é capturado em RULA₂ antes dessa passagem.
- CMP usa a ULA para comparar e restaura o ACC original na própria micro-operação de comparação. Não grava a subtração na MP.
- DI e ULA_OP são estados didáticos de decodificação/controle. O desenho e os barramentos são conceituais, sem pretensão de reproduzir a fiação de uma CPU comercial.
- Cada passo é uma micro-operação conceitual, **não uma medição de ciclos de clock reais**. Não há pipeline, cache ou interrupções.
- São mantidos 1.000 passos para retrocesso. A execução automática pausa após 2.000 passos seguidos para permitir examinar laços.

## Roteiro sugerido de aula

1. Antes de começar, pergunte o que são M13 e o número 7: endereço versus conteúdo.
2. Execute a busca e mostre a diferença entre REM, RDM e RI.
3. Pare depois do incremento: CI já aponta para a próxima instrução, mas RI contém a atual.
4. Observe DI e ULA_OP e identifique as duas origens e o destino.
5. Compare uma origem na memória com o imediato `#5` no exemplo de imediatos.
6. Pare com RULA₁ = 7 e RULA₂ = 5 e peça uma previsão do resultado.
7. Avance a execução e a escrita; volte um passo para demonstrar a alteração da MP.
8. Carregue o laço de comparação. Mostre CMP, flags e o salto que substitui o CI.

## Arquivos

- `index.html`: interface, guia e estrutura dos blocos.
- `styles.css`: tema, ULA em Y, blocos, responsividade e animações.
- `engine.js`: montador, CPU, micro-operações, histórico e validação.
- `app.js`: controles, renderização, exemplos, importação e exportação.
- `exemplos/`: programas prontos em `.asm`.
- `tests.cjs`: testes automatizados do motor. Para desenvolvedores com Node.js: `node --test tests.cjs`.

Testes cobrem todas as operações e condições de salto, preservação do ACC, retrocesso de escrita, seis etapas, conflitos de memória, overflow, divisão por zero e limite de histórico. A interface também foi verificada em navegador.
