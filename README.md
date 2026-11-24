# zombots-uece-edition-2-the-revenge
Segundo trabalho acadêmico da disciplina de Computação Gráfica da UECE.

Protótipo minimalista em **primeira pessoa**, com WebGL puro e módulos JavaScript nativos. Inclui uma arena delimitada, colisões, movimentação pelo teclado, mouse look e um personagem low poly com corpo, botas e braços articulados nas armas de fogo e no melee.

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
| Alternar e equipar soco / katana | `Q` |
| Executar golpe com o melee equipado | Botão esquerdo do mouse ou `F` |
| Golpe melee rápido com arma de fogo equipada | `F` |
| Ativar / silenciar áudio | `M` |
| Disparar (segure para rajada com AKM) | Botão esquerdo do mouse |
| Recarregar (reserva infinita) | `R` ou automaticamente ao esvaziar |
| Pausar / retomar | `P` |
| Liberar o cursor e pausar | `Esc` |
| Entrar / retomar capturando o mouse | Botão na tela |
| Ver o corpo e as pernas | Olhar para baixo |

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
│       ├── character_model.js # Corpo, braços e luvas facetados compartilhados
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

O corpo usa peças facetadas fechadas: camisa verde, colete, cinto, calça, joelheiras e botas. A origem fica no chão; o corpo acompanha o yaw e aparece ao olhar para baixo. As pernas acompanham o deslocamento efetivo, parando quando o jogador fica bloqueado. A cabeça é omitida na malha FPS para não envolver a câmera. Existe somente a visão em primeira pessoa.

O colisor é independente da malha: uma AABB de aproximadamente **1,13 × 1,80 × 1,13**, desde o chão, mantida independente das proporções visuais e da animação. A varredura por eixo bloqueia paredes finas; subpassos e resolução separada permitem deslizar ao longo das paredes.

### Mapa

`assets/map/test_level.json` descreve o campus (100 × 100 unidades, centrado na origem, quatro paredes de 3 unidades). Há dois tipos de elemento:

- **Superfícies (`surfaces`)**: mato (o próprio `floorColor`), asfalto, calçada, estacionamento, ilha da rotatória e faixas pintadas. **Não colidem**; definem a *altura do chão* no ponto. O jogador acompanha essa altura e sobe o meio-fio (calçada = 0,15; asfalto = 0,03). O jogador sobe degraus de até `maxStep` (0,5) em `player.js`; algo mais alto que isso deve ser um obstáculo. O chão é consultado **na altura de quem anda** (`groundHeight(x, z, y)`), por isso andares empilhados funcionam.
- **Obstáculos (`obstacles`, `trees`, paredes)**: geram colisores AABB. Prédios usam `"rect": [x0, z0, x1, z1]` e `"height"`; árvores são `[x, z, escala]` (só o tronco colide, a copa fica acima dos olhos).

- **Prédios com interior (`buildings`)**: o NC2A é gerado a partir da planta do térreo (`assets/map/test_level.json`, chave `buildings`). Cada prédio tem `floors`, `floorHeight`, pisos/lajes/cobertura e uma lista de `walls`. Uma parede é `"line": [x0, z0, x1, z1]` (paralela a um eixo) com `doors`: `{ "at": posição, "width", "state": "open" | "closed", "swing": ±1, "floors": [1, 2] }`. Portas abertas deixam um vão com a folha aberta; fechadas são um painel que colide. `"span": true` faz uma parede externa do chão ao teto. `slabHole` é o vão da laje do 2º andar (sobre a escada). Todos os andares repetem a mesma planta.
- **Escada do NC2A**: 12 degraus de 0,28 (`Degrau 1…12`, superfícies) subindo para leste na sala ESCADAS, com o guarda-corpo do 2º andar como obstáculo. Os degraus ficam abaixo de `maxStep`, então o jogador sobe andando ou correndo.

Formas: `"rect": [x0, z0, x1, z1]` ou `"circle": [cx, cz, raio]`. As cores e alturas ficam em `materials`; uma superfície com `"decal": true` (faixas) não altera a altura do chão. Onde duas superfícies se sobrepõem vale a mais alta, igual ao que aparece na tela. Para editar, altere o JSON e recarregue. Mantenha o spawn livre; o `y` dele é ajustado ao chão automaticamente.
Paredes e obstáculos geram malhas e colisores a partir das mesmas dimensões. Para editar o nível, altere o JSON e recarregue a página. Mantenha dimensões positivas, obstáculos apoiados no chão e o spawn livre dentro da arena. O chão é a referência do salto: a gravidade traz o jogador de volta a Y = 0; não há suporte a plataformas.

### Ajustar o personagem

`src/game/character_model.js` define a paleta, a geometria facetada e as proporções de `PlayerBody` e `FirstPersonArms`. As peças têm chanfros, tampas e normais por face. O corpo é desenhado no mundo e os braços na passagem FPS. Os buffers são reutilizados e liberados ao encerrar o jogo.

Cada arma em `src/game/weapons.js` tem duas pegadas (`grips`) em coordenadas do OBJ, com rotação da mão. O loader exclui os objetos `ArmModel` e `ArmModel.001` dos assets originais, mantendo a geometria das armas. Os braços compartilhados ligam ombro, cotovelo e punho às novas mãos. O soco e a katana usam a mesma roupa e luvas; a katana tem pegada com duas mãos que acompanha o corte.

Os arquivos `assets/player/cube.obj` e `cube.mtl` permanecem apenas como fixtures de teste do loader; não são mais carregados pelo jogo.

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
3. Olhe para cima/baixo e confira o tronco, as pernas e as botas; caminhe, pare e pule para conferir o acompanhamento do corpo.
4. Pause com P/Esc, retome e alterne de janela enquanto segura uma tecla; o movimento deve parar sem salto ao retornar.
5. Redimensione a janela e confira perspectiva, resolução e ausência de erros no console.

## Limites desta versão

O protótipo inclui três inimigos: zumbi verde, robô azul e Zombot preto. Eles usam geometria construída manualmente, perseguem o jogador e possuem colisores AABB contra o jogador, paredes, obstáculos e outros inimigos. Eles param antes do contato e não possuem dano, vida ou golpes nesta etapa. Falhas de carregamento ou de WebGL são exibidas na tela; em caso de perda do contexto gráfico, recarregue a página.
O protótipo inclui três inimigos: zumbi verde, robô azul e Zombot preto. Eles usam geometria construída manualmente, perseguem o jogador e possuem colisores AABB contra o jogador, paredes, obstáculos e outros inimigos. Eles param antes do contato e não possuem dano, vida ou golpes nesta etapa. Falhas de carregamento ou de WebGL são exibidas na tela; em caso de perda do contexto gráfico, recarregue a página.


### Armas e projéteis

A referência atualizada `cg-project3d-uece/assets/` fornece quatro modelos, copiados com seus MTL para `assets/weapons/`: `armapistola.obj`, `arma.obj` (AKM), `armaescopeta.obj` e `armasniper.obj`. A esfera `esfera.obj` é o projétil. Os braços embutidos são excluídos no carregamento e substituídos pelo modelo compartilhado do personagem; os materiais de cores sólidas das armas são preservados.

`src/game/weapons.js` concentra o inventário e as transformações individuais de escala, posição e rotação. Todos apontam originalmente para +X e são girados para −Z. A boca de cada cano tem uma coordenada local própria, transformada para o mundo com a mesma matriz usada no desenho da arma e a orientação da câmera. Somente o slot selecionado é desenhado, em uma passagem FPS após o cenário; os projéteis respeitam a profundidade do mundo.

As teclas 1–4 selecionam pistola, AKM, escopeta e sniper. Os projéteis saem do cano em direção à mira a 40 unidades, viajando a 24 unidades/s. A escopeta lança **oito projéteis por cartucho**, espalhados em um cone de 6° em torno dessa direção; as demais armas lançam um projétil por tiro. A limpeza ocorre após 3 segundos ou 60 unidades, com limite de 64 projéteis simultâneos e buffers compartilhados. A AKM dispara continuamente enquanto o botão esquerdo estiver pressionado; as outras armas exigem um clique por tiro. Não há dano ou colisões de projéteis.

| Arma | Munição por pente | Tempo de recarga | Intervalo entre tiros |
| --- | --- | --- | --- |
| Pistola | 12 | 1,4 s | 0,22 s |
| AKM | 30 | 2,2 s | 8/60 s |
| Escopeta | 8 | 2,6 s | 0,85 s |
| Sniper | 5 | 2,8 s | 1,2 s |

O contador minimalista no canto inferior direito mostra a munição atual em destaque, a capacidade do pente menor ao lado (por exemplo, `12 / 30` na AKM) e o nome da arma, sem caixa de fundo ou texto de reserva. Com pouca munição, os números ficam amarelos e aparece a dica `R · Recarregar`. Durante a recarga, uma barra fina acompanha o progresso, sem contagem de segundos. `R` recarrega um pente parcial; esvaziar o pente inicia a recarga automaticamente. A reserva continua infinita, sem coleta de munição. Durante a recarga não há tiros. Trocar de arma ou executar um golpe melee cancela a recarga, preservando a munição de cada arma; pausar congela o tempo restante. O contador fica oculto durante o melee e no menu.

A recarga reutiliza os modelos atuais: a arma inclina suavemente para baixo em 0,22 s, permanece abaixada e retorna nos últimos 0,28 s. As mãos acompanham a arma e os braços ajustam os cotovelos mantendo os ombros ligados ao corpo. A pose usa o mesmo relógio da recarga, congela na pausa e volta à posição padrão antes de liberar o disparo.

### Áudio

`src/engine/audio.js` usa pools limitados de elementos de áudio para os quatro sons de tiro e os dois sons de movimento melee. Cada disparo ou golpe usa o som da arma correspondente. Não há música nem passos. A tecla `M` silencia/reativa os sons, com indicação no HUD. Pausa, perda de foco e erros interrompem o áudio e limpam as entradas. Falhas de mídia ou bloqueios de autoplay não interrompem o jogo.

`assets/audio/soco.wav` e `katana.wav` são efeitos originais sintetizados de deslocamento de ar, com ressonância metálica na katana. Podem ser regenerados com `python3 scripts/generate_melee_audio.py`, sem dependências externas. Os arquivos prontos já acompanham o jogo.

Áudios de dano, morte, power-up, vitória e derrota não foram associados a eventos porque essas mecânicas não existem nesta versão.

Verificação manual: entre, alterne 1–4, dispare olhando em diferentes direções e durante movimento/salto. Confira alinhamento dos canos, som correspondente, remoção dos projéteis, rajada da AKM ao segurar e interrupção ao soltar, `M`, pausa e retomada. Cliques no menu não devem disparar.

### Soco e katana

O slot melee começa no **soco**. `Q` alterna entre soco e katana e coloca a opção selecionada nas mãos; `1–4` voltam às armas de fogo, preservando a seleção melee. O HUD mostra qual golpe está selecionado.

O **botão esquerdo do mouse** executa um golpe quando soco ou katana estão equipados. `F` também executa um golpe por pressionamento: avanço do punho no soco (0,38 s) ou preparação e corte diagonal na katana (0,62 s). Também funciona como golpe rápido enquanto uma arma de fogo está equipada: ela fica oculta durante a animação e retorna ao terminar. Durante o melee não há disparos; segurar o mouse ou `F` não repete golpes. Trocar com `Q` durante uma animação seleciona o próximo golpe sem modificar o que já começou. Pausar cancela a animação e interrompe seu som.

`src/game/melee.js` controla seleção e tempo dos golpes; `src/game/melee_view.js` utiliza os braços e mãos de `character_model.js` e constrói a katana com guarda, cabo e lâmina curva facetada. As malhas usam cores sólidas, iluminação e a mesma passagem FPS das armas de fogo. Os buffers são compartilhados entre quadros e liberados com o restante das armas.

Esta etapa é somente visual e sonora: **não implementa hitboxes, detecção de acerto ou dano**. Os inimigos mantêm o comportamento existente, mesmo ao receber golpes visualmente.

Verificação manual: pressione `F` com a pistola, depois `Q` e clique esquerdo para a katana, e `Q` e clique esquerdo para o soco. Confira os modelos em repouso, os dois movimentos e sons; volte para 1–4 e teste o golpe rápido. Experimente `M`, pausa/perda de foco durante o golpe e retomada. Confira que manter o mouse ou `F` pressionado não repete golpes e que clicar durante o melee não cria projéteis. Dispare com cada arma até esvaziar o pente, confira a recarga automática e teste `R` com um pente parcial; troque de arma durante a recarga e verifique a preservação da munição. Na escopeta, observe o espalhamento ao disparar em diferentes direções.
