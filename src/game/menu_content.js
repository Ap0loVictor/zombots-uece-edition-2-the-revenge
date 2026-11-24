// Conteúdo textual do menu principal. Dados puros: o desenho fica em menu.js.

// Cada controle lista alternativas de teclas (`keys`); cada alternativa é uma combinação
// de teclas mostradas lado a lado. Mantenha em sincronia com player.js, weapons.js e game_main.js.
export const CONTROL_GROUPS = [
    {
        title: 'Movimento',
        controls: [
            { keys: [['W', 'A', 'S', 'D'], ['↑', '←', '↓', '→']], action: 'Andar para frente, esquerda, trás e direita' },
            { keys: [['Mouse']], action: 'Olhar ao redor (câmera em primeira pessoa)' },
            { keys: [['Shift']], action: 'Correr (segure enquanto anda)' },
            { keys: [['Espaço']], action: 'Pular' },
        ],
    },
    {
        title: 'Combate',
        controls: [
            { keys: [['Botão esquerdo']], action: 'Atirar (com a AKM, segure para disparar em rajada)' },
            { keys: [['1']], action: 'Equipar a pistola' },
            { keys: [['2']], action: 'Equipar a AKM' },
            { keys: [['3']], action: 'Equipar a escopeta' },
            { keys: [['4']], action: 'Equipar o sniper' },
            { keys: [['Q']], action: 'Alternar entre soco e katana' },
            { keys: [['F']], action: 'Golpe corpo a corpo com o soco ou a katana selecionados' },
        ],
    },
    {
        title: 'Jogo',
        controls: [
            { keys: [['M']], action: 'Ativar / silenciar o som' },
            { keys: [['P']], action: 'Pausar / retomar' },
            { keys: [['Esc']], action: 'Liberar o cursor e pausar (abre este menu)' },
        ],
    },
];

export const CONTROL_TIPS = [
    'Olhe para baixo para ver o corpo e as botas do personagem.',
    'Ao clicar em Jogar, o navegador captura o mouse. Use Esc para soltá-lo.',
];

export const LORE = [
    'Após o mundo ser salvo por suas versões de um futuro paralelo, Apolo, Marques e Jannsen descobrem que ainda não é o fim.',
    'Por trás de Mr. Black havia uma mente muito mais maligna, muito pior, que agora, com seu pupilo descontrolado fora de jogo, pode finalmente pôr seu real plano em ação.',
    'Para derrotar essa nova ameaça, nossos heróis precisarão enfrentar zumbis, robôs e zombots, agora no presente e sem suas versões aprimoradas do futuro.',
    'Será que eles conseguirão derrotá-lo? Só há um jeito de descobrir!',
];

// A ordem é a exibida na tela.
export const CREDITS = {
    people: ['Apolo Victor', 'Davi Jannsen', 'Gabriel Marques'],
    course: 'Computação Gráfica - Uece',
};
