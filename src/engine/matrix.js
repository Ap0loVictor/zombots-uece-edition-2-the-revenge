// Matrizes column-major, como na engine de referência; multiply(a, b) = a × b.
export const Matrix4 = {
    identity() {
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    },

    multiply(a, b) {
        const result = new Array(16).fill(0);
        for (let column = 0; column < 4; column++) {
            for (let row = 0; row < 4; row++) {
                for (let k = 0; k < 4; k++) {
                    result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
                }
            }
        }
        return result;
    },

    translation(x, y, z) {
        const matrix = this.identity();
        matrix[12] = x;
        matrix[13] = y;
        matrix[14] = z;
        return matrix;
    },

    scaling(x, y, z) {
        return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
    },

    rotationX(angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
    },

    rotationY(angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
    },

    perspective(fov, aspect, near, far) {
        const f = 1 / Math.tan(fov / 2);
        const range = 1 / (near - far);
        return [f / aspect, 0, 0, 0, 0, f, 0, 0,
            0, 0, (near + far) * range, -1, 0, 0, 2 * near * far * range, 0];
    },

    // Inversa transposta 3×3: preserva iluminação sob escala não uniforme.
    normalMatrix(m) {
        const a = m[0], b = m[4], c = m[8];
        const d = m[1], e = m[5], f = m[9];
        const g = m[2], h = m[6], i = m[10];
        const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
        if (Math.abs(determinant) < 1e-12) throw new Error('Transformação de malha não invertível.');
        return [e * i - f * h, c * h - b * i, b * f - c * e,
            f * g - d * i, a * i - c * g, c * d - a * f,
            d * h - e * g, b * g - a * h, a * e - b * d].map(value => value / determinant);
    },
};
