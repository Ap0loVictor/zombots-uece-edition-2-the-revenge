import { Matrix4 } from '../engine/matrix.js';
import { Mesh } from '../engine/mesh.js';

export const CHARACTER_COLORS = {
    shirt: [0.23, 0.29, 0.17, 1], cuff: [0.15, 0.19, 0.11, 1],
    skin: [0.615, 0.442, 0.318, 1], glove: [0.075, 0.085, 0.09, 1],
    pad: [0.14, 0.16, 0.17, 1], pants: [0.19, 0.23, 0.17, 1],
    vest: [0.12, 0.15, 0.105, 1], boot: [0.065, 0.07, 0.06, 1],
    buckle: [0.38, 0.4, 0.34, 1],
};

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = a => mul(a, 1 / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function posePoint(matrix, point) {
    return [0, 1, 2].map(row => matrix[12 + row] + point.reduce((sum, v, col) => sum + matrix[col * 4 + row] * v, 0));
}

// Peça octogonal fechada, com chanfros e normais por face (60 triângulos).
// Compartilhada por roupa, articulações e luvas; nenhuma ponta aberta nas mangas.
export function createCharacterMesh(gl) {
    const positions = [], normals = [];
    const outline = [[-.32, -.5], [.32, -.5], [.5, -.32], [.5, .32],
        [.32, .5], [-.32, .5], [-.5, .32], [-.5, -.32]];
    const rings = [[-.5, .76], [-.36, 1], [.34, .92], [.5, .7]]
        .map(([y, s]) => outline.map(([x, z]) => [x * s, y, z * s]));
    const triangle = (a, b, c) => {
        const n = unit(cross(sub(b, a), sub(c, a)));
        Mesh.pushTriangle(positions, normals, [a, b, c], [n, n, n]);
    };
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        triangle(rings[r][i], rings[r + 1][i], rings[r][j]);
        triangle(rings[r][j], rings[r + 1][i], rings[r + 1][j]);
    }
    for (let i = 1; i < 7; i++) {
        triangle(rings[0][0], rings[0][i], rings[0][i + 1]);
        triangle(rings[3][0], rings[3][i + 1], rings[3][i]);
    }
    return new Mesh(gl, positions, normals);
}

export class CharacterParts {
    constructor(gl) { this.mesh = createCharacterMesh(gl); }

    part(info, pose, offset, size, color) {
        this.mesh.color = color;
        this.mesh.modelMatrix = Matrix4.multiply(pose,
            Matrix4.multiply(Matrix4.translation(...offset), Matrix4.scaling(...size)));
        this.mesh.draw(info);
    }

    segment(info, a, b, width, depth, color) {
        const y = unit(sub(b, a));
        const x = unit(cross(y, Math.abs(y[2]) > .95 ? [0, 1, 0] : [0, 0, 1]));
        const z = cross(x, y), center = mul(add(a, b), .5);
        const pose = [...x, 0, ...y, 0, ...z, 0, ...center, 1];
        this.part(info, pose, [0, 0, 0], [width, Math.hypot(...sub(b, a)) + .025, depth], color);
    }

    dispose() { this.mesh.dispose(); }
}

// Resolve o cotovelo num plano voltado para baixo e para fora do corpo.
// Os pontos são da passagem FPS; mãos e arma usam a mesma transformação.
export function armJoints(wrist, side) {
    const shoulder = [side * .36, -.40, .20];
    const delta = sub(wrist, shoulder), distance = Math.hypot(...delta), axis = unit(delta);
    const pole = [side * .65, -1, .15];
    const bend = unit(sub(pole, mul(axis, dot(pole, axis))));
    const length = Math.max(.64, distance * .505);
    const elbow = add(add(shoulder, mul(delta, .5)), mul(bend, Math.sqrt(length * length - distance * distance / 4)));
    return { shoulder, elbow, wrist };
}

export class FirstPersonArms extends CharacterParts {
    arm(info, handPose, side) {
        const wrist = posePoint(handPose, [0, -.055, .065]);
        const { shoulder, elbow } = armJoints(wrist, side);
        const cuff = add(wrist, mul(sub(elbow, wrist), .14));
        const c = CHARACTER_COLORS;
        this.segment(info, shoulder, elbow, .205, .19, c.shirt);
        this.part(info, Matrix4.translation(...elbow), [0, 0, 0], [.17, .17, .17], c.cuff);
        this.segment(info, elbow, cuff, .155, .15, c.shirt);
        this.segment(info, cuff, wrist, .115, .11, c.cuff);
        this.part(info, handPose, [0, -.04, .055], [.10, .10, .12], c.skin);
    }

    hand(info, pose, side, fist = false) {
        const c = CHARACTER_COLORS;
        // Palma atrás do cabo, dedos pela frente e polegar pelo lado interno.
        this.part(info, pose, [0, 0, .035], [.125, .145, .085], c.glove);
        for (let i = 0; i < 4; i++) {
            this.part(info, pose, [side * .015, -.052 + i * .034, fist ? -.045 : -.035],
                [.12, .031, fist ? .075 : .055], c.pad);
        }
        this.part(info, pose, [-side * .068, .018, .005], [.045, .085, .085], c.glove);
    }

    hold(info, pose, side, fist = false) {
        this.arm(info, pose, side);
        this.hand(info, pose, side, fist);
    }

    drawFirearm(info, weapon, weaponPose = Matrix4.identity()) {
        for (const grip of weapon.grips) {
            const position = posePoint(weapon.localMatrix, grip.point);
            const pose = Matrix4.multiply(Matrix4.translation(...position),
                Matrix4.multiply(Matrix4.rotationZ(grip.roll ?? 0), Matrix4.rotationX(grip.pitch ?? 0)));
            // Mãos acompanham a inclinação da arma; os braços se ajustam mantendo
            // os ombros presos ao corpo com a articulação já existente.
            this.hold(info, Matrix4.multiply(weaponPose, pose), grip.side);
        }
    }
}

export class PlayerBody extends CharacterParts {
    constructor(gl) {
        super(gl);
        this.modelMatrix = Matrix4.identity();
        this.stride = 0;
        this.walkAmount = 0;
    }

    update(distance, dt, grounded) {
        this.stride += distance * 8;
        const target = grounded && distance > .0001 ? Math.min(1, distance / Math.max(dt, .001) / 3) : 0;
        this.walkAmount += (target - this.walkAmount) * (1 - Math.exp(-12 * dt));
    }

    draw(info) {
        const c = CHARACTER_COLORS, pose = this.modelMatrix;
        // Cabeça omitida no corpo FPS para não envolver a câmera.
        this.part(info, pose, [0, 1.19, .25], [.56, .55, .32], c.shirt);
        this.part(info, pose, [0, 1.22, .08], [.44, .40, .09], c.vest);
        this.part(info, pose, [0, .90, .19], [.43, .14, .30], c.pants);
        this.part(info, pose, [0, .96, .19], [.46, .065, .32], c.boot);
        this.part(info, pose, [0, .96, .025], [.09, .06, .025], c.buckle);
        for (const side of [-1, 1]) {
            const swing = Math.sin(this.stride) * .32 * this.walkAmount * side;
            const hip = Matrix4.multiply(pose, Matrix4.multiply(Matrix4.translation(side * .135, .88, .12), Matrix4.rotationX(.12 + swing)));
            this.part(info, hip, [0, -.20, 0], [.23, .43, .26], c.pants);
            this.part(info, hip, [0, -.40, -.055], [.18, .16, .16], c.vest);
            const knee = Matrix4.multiply(hip, Matrix4.multiply(Matrix4.translation(0, -.40, 0), Matrix4.rotationX(-Math.max(0, swing))));
            this.part(info, knee, [0, -.17, 0], [.18, .36, .20], c.pants);
            this.part(info, knee, [0, -.385, -.13], [.22, .20, .36], c.boot);
            this.part(info, pose, [side * .16, 1.15, .06], [.15, .17, .07], c.cuff);
        }
    }
}
