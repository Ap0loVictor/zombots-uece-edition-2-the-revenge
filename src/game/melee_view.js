import { Matrix4 } from '../engine/matrix.js';
import { Mesh } from '../engine/mesh.js';

const COLORS = {
    sleeve: [0.145, 0.184, 0.111, 1], skin: [0.615, 0.442, 0.318, 1],
    glove: [0.055, 0.062, 0.068, 1], knuckle: [0.14, 0.16, 0.17, 1],
    gold: [0.66, 0.46, 0.19, 1], wrap: [0.16, 0.22, 0.24, 1],
};
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// Lâmina curva com seção facetada, gume claro e ponta afilada. Sem texturas.
function bladeMesh(gl) {
    const positions = [], normals = [], colors = [];
    const sections = [[0, 0.18, 0.048], [0.006, 0.48, 0.047], [0.023, 0.78, 0.044],
        [0.052, 1.04, 0.037], [0.088, 1.22, 0]];
    const rings = sections.map(([x, y, width]) => [
        [x - width, y, 0], [x, y, 0.014], [x + width, y, 0], [x, y, -0.014],
    ]);
    const shades = [[0.89, 0.94, 0.96, 1], [0.48, 0.59, 0.65, 1],
        [0.38, 0.48, 0.55, 1], [0.75, 0.84, 0.89, 1]];
    function triangle(a, b, c, color) {
        const u = b.map((v, i) => v - a[i]), v = c.map((value, i) => value - a[i]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(...n);
        if (length < 1e-10) return;
        for (const point of [a, b, c]) {
            positions.push(...point);
            normals.push(...n.map(value => value / length));
            colors.push(...color);
        }
    }
    // O anel final converge em um único ponto, fechando a ponta.
    rings[rings.length - 1] = Array.from({ length: 4 }, () => [0.088, 1.22, 0]);
    for (let r = 0; r < rings.length - 1; r++) for (let side = 0; side < 4; side++) {
        const next = (side + 1) % 4;
        triangle(rings[r][side], rings[r][next], rings[r + 1][side], shades[side]);
        triangle(rings[r][next], rings[r + 1][next], rings[r + 1][side], shades[side]);
    }
    triangle(rings[0][0], rings[0][2], rings[0][1], shades[1]);
    triangle(rings[0][0], rings[0][3], rings[0][2], shades[1]);
    return new Mesh(gl, positions, normals, colors);
}

export class MeleeView {
    constructor(gl) {
        this.box = Mesh.box(gl);
        this.blade = bladeMesh(gl);
    }

    part(programInfo, pose, offset, size, color) {
        this.box.color = color;
        this.box.modelMatrix = Matrix4.multiply(pose,
            Matrix4.multiply(Matrix4.translation(...offset), Matrix4.scaling(...size)));
        this.box.draw(programInfo);
    }

    fist(programInfo, pose, side) {
        this.part(programInfo, pose, [0, -0.1, 0.23], [0.18, 0.23, 0.4], COLORS.sleeve);
        this.part(programInfo, pose, [0, -0.025, 0.055], [0.145, 0.15, 0.14], COLORS.skin);
        this.part(programInfo, pose, [0, 0, -0.035], [0.20, 0.17, 0.19], COLORS.glove);
        for (let i = 0; i < 4; i++) {
            this.part(programInfo, pose, [-0.073 + i * 0.049, 0.025, -0.132], [0.044, 0.105, 0.045], COLORS.knuckle);
        }
        this.part(programInfo, pose, [-side * 0.11, -0.05, -0.035], [0.07, 0.09, 0.12], COLORS.skin);
    }

    draw(programInfo, index, progress) {
        const p = progress ?? 0;
        if (index === 0) {
            const extension = progress === null ? 0 : p < 0.32 ? smooth(p / 0.32) : 1 - smooth((p - 0.32) / 0.68);
            this.fist(programInfo, Matrix4.multiply(Matrix4.translation(-0.32, -0.31, -0.62), Matrix4.rotationY(-0.15)), -1);
            this.fist(programInfo, Matrix4.multiply(
                Matrix4.translation(0.32 - 0.27 * extension, -0.31 + 0.18 * extension, -0.62 - 0.46 * extension),
                Matrix4.rotationX(-0.1 * extension)), 1);
            return;
        }
        const windup = progress === null ? 0 : p < 0.2 ? smooth(p / 0.2) : 1 - smooth((p - 0.2) / 0.18);
        const slash = progress === null ? 0 : p < 0.48 ? smooth((p - 0.2) / 0.28) : 1 - smooth((p - 0.48) / 0.52);
        const pose = Matrix4.multiply(Matrix4.translation(0.36 - 0.46 * slash, -0.40 - 0.12 * slash, -0.82),
            Matrix4.multiply(Matrix4.rotationZ(-0.18 - 0.45 * windup + 1.65 * slash), Matrix4.rotationX(-0.40)));
        this.part(programInfo, pose, [0, -0.27, 0.16], [0.18, 0.3, 0.25], COLORS.sleeve);
        this.part(programInfo, pose, [0, -0.13, 0.04], [0.16, 0.15, 0.14], COLORS.skin);
        this.part(programInfo, pose, [0, 0, 0], [0.075, 0.33, 0.075], COLORS.glove);
        for (let i = 0; i < 6; i++) {
            this.part(programInfo, pose, [0, -0.13 + i * 0.052, 0], [0.082, 0.018, 0.082], COLORS.wrap);
        }
        this.part(programInfo, pose, [0, -0.025, 0.065], [0.17, 0.14, 0.10], COLORS.glove);
        this.part(programInfo, pose, [0.095, -0.04, 0.01], [0.06, 0.09, 0.1], COLORS.skin);
        this.part(programInfo, pose, [0, -0.175, 0], [0.09, 0.035, 0.09], COLORS.gold);
        this.part(programInfo, pose, [0, 0.175, 0], [0.24, 0.035, 0.16], COLORS.gold);
        this.blade.modelMatrix = pose;
        this.blade.draw(programInfo);
    }

    dispose() {
        this.box.dispose();
        this.blade.dispose();
    }
}
