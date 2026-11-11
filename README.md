# zombots-uece-edition-2-the-revenge
Segundo trabalho acadêmico da disciplina de Computação Gráfica da UECE.

Protótipo minimalista em **primeira pessoa**, com WebGL puro e módulos JavaScript nativos. Inclui uma arena delimitada, colisões, movimentação pelo teclado, mouse look e um cubo vermelho flutuante como corpo provisório do jogador.


## História

Após o mundo ser salvo por suas versões de um futuro paralelo, **Apolo**, **Marques** e **Jannsen** descobrem que não é o fim, por trás de Mr. Black havia uma mente muito mais maligna, muito pior e que agora com seu pupilo descontrolado fora de jogo, pode finalmente pôr seu real plano em ação, para derrotar essa nova ameaça, nossos heróis precisarão enfrentar **zumbis**, **robôs** e **zombots** agora no presente e sem suas versões aprimoradas do futuro, será que eles conseguirão derrotá-lo? - Só há um jeito de descobrir!

## Executar

Na raiz do projeto, inicie um servidor HTTP local:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra **http://127.0.0.1:8000** em um navegador desktop com WebGL, teclado e mouse. Clique em **Entrar** para capturar o cursor. Não abra `index.html` diretamente por `file://`: os módulos JavaScript e o carregamento de OBJ/MTL/JSON precisam do servidor HTTP.

Não há dependências externas, CDN, instalação de pacotes ou etapa de build. Node.js é necessário apenas para executar os testes.

## Controles

| Ação | Controle |
| --- | --- |
| Mover para frente/trás e lateralmente | `WASD` ou setas |
| Olhar | Mouse |
| Correr | Segurar `Espaço` enquanto se move |
| Pausar / retomar | `P` |
| Liberar o cursor e pausar | `Esc` |
| Entrar / retomar capturando o mouse | Botão na tela |
| Ver o corpo provisório | Olhar para baixo |

Perder o foco da janela ou ocultar a aba pausa o jogo e limpa as entradas. A retomada preserva posição e orientação, sem reaplicar teclas antigas. O movimento é restrito ao plano XZ; olhar para cima não altera a altura do jogador.

## Arquitetura

A base foi adaptada das abstrações `Matrix4`, `Mesh`, `Shaders`, `OBJLoader`, `InputHandler` e `FPSCamera` do projeto de referência `cg-project3d-uece`. O ponto de entrada e a organização do cenário foram derivados de `game/game_main.js` dessa referência, sem importar combate, inimigos ou hordas.

`src/engine/` contém recursos reutilizáveis e não importa módulos de `game`. `src/game/` define o jogador, as regras de movimento e o nível. Os módulos usam `import`/`export` em vez de depender de classes globais e da ordem de múltiplas tags de script.

```text
zombots-uece-edition-2-the-revenge/
├── main.js                  # Ponto de entrada
├── index.html               # Canvas e interface mínima
├── package.json             # Módulos ES e comando de testes; sem dependências
├── src/
│   ├── engine/
│   │   ├── gl.js            # Contexto WebGL 1, profundidade e resolução
│   │   ├── matrix.js        # Transformações, perspectiva e matriz de normais
│   │   ├── shaders.js       # Cores sólidas e iluminação ambiente/difusa
│   │   ├── mesh.js          # Buffers, desenho e primitivas plano/cubo
│   │   ├── obj_loader.js    # Geometria OBJ e material difuso MTL
│   │   ├── input.js         # Teclado, mouse e Pointer Lock
│   │   ├── camera.js        # Orientação FPS e matrizes de visão/projeção
│   │   └── collision.js     # AABB, varredura por eixo e subdivisão de movimento
│   └── game/
│       ├── game_main.js     # Inicialização, estados, atualização e renderização
│       ├── player.js        # Posição, movimento, corpo, colisão e vínculo da câmera
│       └── level.js         # Geometria e colisores derivados dos dados do mapa
├── assets/
│   ├── player/
│   │   ├── cube.obj         # Cubo unitário, seis faces e doze triângulos
│   │   └── cube.mtl         # Material vermelho
│   └── map/
│       └── test_level.json # Arena, obstáculos, cores e posição inicial
└── tests/
    └── prototype.test.js    # Movimento, câmera, colisões, matrizes e OBJ/MTL
```

### Jogador e câmera

O `Player` é responsável pela posição. A câmera controla apenas orientação e projeção; recebe a posição do jogador depois da resolução das colisões, com os olhos a **1,60 unidade** acima do chão. A sequência de atualização é:

1. Consumir os deltas do mouse e atualizar yaw/pitch.
2. Calcular a direção no plano XZ a partir do teclado e do yaw.
3. Normalizar diagonais e aplicar velocidade × tempo decorrido.
4. Resolver o deslocamento contra os colisores do nível.
5. Sincronizar a posição da câmera e renderizar o cenário e o corpo.

O pitch é limitado a ±89°. A velocidade normal é 3 unidades/s e a corrida, 5,5 unidades/s. O loop limita deltas de tempo a 50 ms para evitar saltos após interrupções; sob taxas inferiores a 20 FPS a simulação pode desacelerar.

O cubo tem lado **0,80**, centro a **0,80** do chão e base a **0,40**. Sua altura é fixa: “flutuante” não inclui oscilação ou física vertical. A câmera fica acima dele; o corpo acompanha o yaw e aparece ao olhar para baixo. Existe somente a visão em primeira pessoa.

O colisor é independente da malha: uma AABB de aproximadamente **1,13 × 1,80 × 1,13**, desde o chão, que também cobre os cantos do cubo quando ele gira. A varredura por eixo bloqueia paredes finas; subpassos e resolução separada permitem deslizar ao longo das paredes.

### Mapa

`assets/map/test_level.json` define uma arena de **20 × 20 unidades**, centrada na origem, com chão em Y = 0, quatro paredes de 3 unidades de altura e dois blocos internos. O spawn é `(0, 0, 6)`, olhando inicialmente para −Z. A grade do chão tem espaçamento de uma unidade.

Paredes e obstáculos geram malhas e colisores a partir das mesmas dimensões. Para editar o nível, altere o JSON e recarregue a página. Mantenha dimensões positivas, obstáculos apoiados no chão e o spawn livre dentro da arena. Nesta versão, o chão define a altura fixa de navegação; não existe simulação de gravidade ou suporte a plataformas.

### Substituir o placeholder pelo modelo do Blender

1. Exporte um OBJ com eixo vertical **Y**, frente em **−Z**, normais e faces trianguladas, acompanhado de MTL com cor difusa `Kd`.
2. Coloque os arquivos em `assets/player/`; a referência `mtllib` do OBJ deve apontar para o MTL relativo à mesma pasta.
3. Atualize o caminho passado a `OBJLoader.load` em `src/game/game_main.js`.
4. Ajuste `bodySize` e `bodyHeight` em `src/game/player.js` para a escala e origem do modelo. O cubo atual usa uma malha unitária centrada na origem.
5. Confira o enquadramento ao olhar para baixo e ajuste o colisor separadamente se as proporções do robô mudarem.

O carregador aceita índices positivos/negativos e triangula faces convexas. Se faltarem normais, calcula normais por triângulo. UVs presentes nos índices são ignorados; texturas, mapas de materiais e animações não são carregados.

## Verificação

Com Node.js 22 ou superior:

```bash
npm test
```

Não é necessário executar `npm install`. Os testes verificam velocidade em 30/60/144 FPS, diagonais, corrida, orientação, matrizes, bloqueio de paredes finas, deslizamento, cantos e a geometria/material dos assets reais.

Para conferir a integração no navegador:

1. Entre, movimente-se com WASD/setas e gire a câmera com o mouse.
2. Corra contra as quatro paredes e os dois blocos; teste também diagonais e cantos.
3. Olhe para cima/baixo e confirme que a altura permanece fixa e o corpo vermelho é visível abaixo.
4. Pause com P/Esc, retome e alterne de janela enquanto segura uma tecla; o movimento deve parar sem salto ao retornar.
5. Redimensione a janela e confira perspectiva, resolução e ausência de erros no console.

## Limites desta versão

O protótipo não inclui combate, inimigos, hordas, vida, áudio, texturas, salto, gravidade, animações do robô ou controles touch. A tecla X não tem ação nesta etapa. Falhas de carregamento ou de WebGL são exibidas na tela; em caso de perda do contexto gráfico, recarregue a página.

