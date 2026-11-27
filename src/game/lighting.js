// Predefinições de iluminação do jogo (espaço de mundo; ver engine/lighting.js).

const OFF_LIGHT = { position: [0, 0, 0], direction: [0, -1, 0], color: [0, 0, 0], attenuation: [1, 0, 0], innerCos: -1.1, outerCos: -1.2 };
const NO_SUN = { direction: [0, 1, 0], color: [0, 0, 0] };

// Jogo: quase escuro. Só um resquício de luz azulada para não ficar preto absoluto; o resto vem da luz do capacete.
export const GAME_AMBIENT = [0.02, 0.024, 0.04];
// A arma e os braços ficam colados na câmera, na frente do cone da lanterna; um preenchimento mantém a silhueta legível.
export const VIEWMODEL_AMBIENT = [0.2, 0.2, 0.22];
// A luz do capacete está a ~0,6 m das armas: sem reduzir, elas estourariam para branco.
export const VIEWMODEL_LIGHT_SCALE = 0.45;
export const GAME_CLEAR_COLOR = [0.008, 0.01, 0.018, 1];

// Menu: o campus iluminado por um "sol" fraco, para servir de fundo.
export const MENU_CLEAR_COLOR = [0.075, 0.11, 0.15, 1];

const eyeOf = camera => [camera.position.x, camera.position.y, camera.position.z];

export function gameLighting(camera, helmet, elapsed) {
    return { eye: eyeOf(camera), ambient: GAME_AMBIENT, sun: NO_SUN, light: helmet.light(camera, elapsed) };
}

export function menuLighting(camera) {
    const length = Math.hypot(-0.4, 1, 0.6);
    return {
        eye: eyeOf(camera),
        ambient: [0.42, 0.42, 0.42],
        sun: { direction: [-0.4 / length, 1 / length, 0.6 / length], color: [0.58, 0.58, 0.58] },
        light: OFF_LIGHT,
    };
}
