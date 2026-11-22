# zombots-uece-edition-2-the-revenge
Segundo trabalho acadêmico da disciplina de Computação Gráfica da UECE.

Protótipo minimalista em **primeira pessoa**, com WebGL puro e módulos JavaScript nativos. Inclui uma arena delimitada, colisões, movimentação pelo teclado, mouse look e um cubo vermelho flutuante como corpo provisório do jogador.

## Para rodar
Linux: ```python3 -m http.server 8000 --bind 127.0.0.1```

Win: ```python -m http.server 8000 --bind 127.0.0.1```


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
| Correr | Segurar `Shift` enquanto se move |
| Pular | `Espaço` |
| Selecionar pistola / AKM / escopeta / sniper | `1` / `2` / `3` / `4` |
| Ativar / silenciar áudio | `M` |
| Disparar (segure para rajada com AKM) | Botão esquerdo do mouse |
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
│       ├── enemy.js         # Inimigos visuais: zumbi, robô e Zombot
│       └── level.js         # Geometria e colisores derivados dos dados do mapa
├── assets/
│   ├── player/
│   │   ├── cube.obj         # Cubo unitário, seis faces e doze triângulos
│   │   └── cube.mtl         # Material vermelho
│   └── map/
│       └── test_level.json # Campus: superfícies, prédios, árvores e spawn
└── tests/
    ├── prototype.test.js    # Movimento, câmera, colisões, matrizes e OBJ/MTL
    └── level.test.js        # Altura do chão, calçadas, spawn e validação do mapa
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

`assets/map/test_level.json` descreve o campus (100 × 100 unidades, centrado na origem, quatro paredes de 3 unidades). Há dois tipos de elemento:

- **Superfícies (`surfaces`)**: mato (o próprio `floorColor`), asfalto, calçada, estacionamento, ilha da rotatória e faixas pintadas. **Não colidem**; definem a *altura do chão* no ponto. O jogador acompanha essa altura e sobe o meio-fio (calçada = 0,15; asfalto = 0,03). O jogador sobe degraus de até `maxStep` (0,5) em `player.js`; algo mais alto que isso deve ser um obstáculo. O chão é consultado **na altura de quem anda** (`groundHeight(x, z, y)`), por isso andares empilhados funcionam.
- **Obstáculos (`obstacles`, `trees`, paredes)**: geram colisores AABB. Prédios usam `"rect": [x0, z0, x1, z1]` e `"height"`; árvores são `[x, z, escala]` (só o tronco colide, a copa fica acima dos olhos).

- **Prédios com interior (`buildings`)**: o NC2A é gerado a partir da planta do térreo (`assets/map/test_level.json`, chave `buildings`). Cada prédio tem `floors`, `floorHeight`, pisos/lajes/cobertura e uma lista de `walls`. Uma parede é `"line": [x0, z0, x1, z1]` (paralela a um eixo) com `doors`: `{ "at": posição, "width", "state": "open" | "closed", "swing": ±1, "floors": [1, 2] }`. Portas abertas deixam um vão com a folha aberta; fechadas são um painel que colide. `"span": true` faz uma parede externa do chão ao teto. `slabHole` é o vão da laje do 2º andar (sobre a escada). Todos os andares repetem a mesma planta.
- **Escada do NC2A**: 12 degraus de 0,28 (`Degrau 1…12`, superfícies) subindo para leste na sala ESCADAS, com o guarda-corpo do 2º andar como obstáculo. Os degraus ficam abaixo de `maxStep`, então o jogador sobe andando ou correndo.

Formas: `"rect": [x0, z0, x1, z1]` ou `"circle": [cx, cz, raio]`. As cores e alturas ficam em `materials`; uma superfície com `"decal": true` (faixas) não altera a altura do chão. Onde duas superfícies se sobrepõem vale a mais alta, igual ao que aparece na tela. Para editar, altere o JSON e recarregue. Mantenha o spawn livre; o `y` dele é ajustado ao chão automaticamente.
Paredes e obstáculos geram malhas e colisores a partir das mesmas dimensões. Para editar o nível, altere o JSON e recarregue a página. Mantenha dimensões positivas, obstáculos apoiados no chão e o spawn livre dentro da arena. O chão é a referência do salto: a gravidade traz o jogador de volta a Y = 0; não há suporte a plataformas.

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

O protótipo inclui três inimigos: zumbi verde, robô azul e Zombot preto. Eles usam geometria construída manualmente, perseguem o jogador e possuem colisores AABB contra o jogador, paredes, obstáculos e outros inimigos. Eles param antes do contato e não possuem dano, vida ou golpes nesta etapa. Falhas de carregamento ou de WebGL são exibidas na tela; em caso de perda do contexto gráfico, recarregue a página.
O protótipo inclui três inimigos: zumbi verde, robô azul e Zombot preto. Eles usam geometria construída manualmente, perseguem o jogador e possuem colisores AABB contra o jogador, paredes, obstáculos e outros inimigos. Eles param antes do contato e não possuem dano, vida ou golpes nesta etapa. Falhas de carregamento ou de WebGL são exibidas na tela; em caso de perda do contexto gráfico, recarregue a página.


### Armas e projéteis

A referência atualizada `cg-project3d-uece/assets/` fornece quatro modelos, copiados com seus MTL para `assets/weapons/`: `armapistola.obj`, `arma.obj` (AKM), `armaescopeta.obj` e `armasniper.obj`. A esfera `esfera.obj` é o projétil. Os modelos incluem braços e preservam os materiais de cores sólidas.

`src/game/weapons.js` concentra o inventário e as transformações individuais de escala, posição e rotação. Todos apontam originalmente para +X e são girados para −Z. A boca de cada cano tem uma coordenada local própria, transformada para o mundo com a mesma matriz usada no desenho da arma e a orientação da câmera. Somente o slot selecionado é desenhado, em uma passagem FPS após o cenário; os projéteis respeitam a profundidade do mundo.

As teclas 1–4 selecionam pistola, AKM, escopeta e sniper. Cada clique esquerdo cria um projétil que converge para a mira a 40 unidades, viajando a 24 unidades/s. A limpeza ocorre após 3 segundos ou 60 unidades, com limite de 64 projéteis simultâneos e buffers compartilhados. A AKM dispara continuamente enquanto o botão esquerdo estiver pressionado, com intervalo de 8/60 s entre tiros; as outras armas disparam uma esfera por clique; não há dano, colisões de projéteis ou lógica de combate.

### Áudio

`src/engine/audio.js` usa pools limitados de elementos de áudio apenas para os quatro sons de tiro. Cada disparo usa o som da arma equipada. Não há música nem passos. A tecla `M` silencia/reativa os sons, com indicação no HUD. Pausa, perda de foco e erros interrompem o áudio e limpam o botão pressionado. Falhas de mídia ou bloqueios de autoplay não interrompem o jogo.

Áudios de dano, morte, power-up, vitória e derrota não foram associados a eventos porque essas mecânicas não existem nesta versão.

Verificação manual: entre, alterne 1–4, dispare olhando em diferentes direções e durante movimento/salto. Confira alinhamento dos canos, som correspondente, remoção dos projéteis, rajada da AKM ao segurar e interrupção ao soltar, `M`, pausa e retomada. Cliques no menu não devem disparar.
