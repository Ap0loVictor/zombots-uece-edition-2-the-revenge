import { Matrix4 } from './matrix.js';

export class Mesh {
    constructor(gl, vertexData, normalData, colorData = null, uvData = null) {
        this.gl = gl;
        this.vertexCount = vertexData.length / 3;
        this.positionBuffer = this.createBuffer(vertexData);
        this.normalBuffer = this.createBuffer(normalData);
        this.colorBuffer = colorData ? this.createBuffer(colorData) : null;
        this.uvBuffer = uvData ? this.createBuffer(uvData) : null;
        this.texture = null;
        this.modelMatrix = Matrix4.identity();
        this.color = [1, 1, 1, 1];
        // Material de Phong: Ks (escalar), expoente n e cor emissiva.
        this.specular = 0.15;
        this.shininess = 24;
        this.emissive = [0, 0, 0];
    }

    createBuffer(data) {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        return buffer;
    }

    draw({ attribs, uniforms }) {
        const gl = this.gl;
        gl.uniformMatrix4fv(uniforms.u_model, false, this.modelMatrix);
        gl.uniformMatrix3fv(uniforms.u_normalMatrix, false, Matrix4.normalMatrix(this.modelMatrix));
        gl.uniform4fv(uniforms.u_color, this.color);
        if (uniforms.u_specular) gl.uniform1f(uniforms.u_specular, this.specular);
        if (uniforms.u_shininess) gl.uniform1f(uniforms.u_shininess, this.shininess);
        if (uniforms.u_emissive) gl.uniform3fv(uniforms.u_emissive, this.emissive);
        gl.uniform1i(uniforms.u_useVertexColors, this.colorBuffer ? 1 : 0);
        if (uniforms.u_useTexture) gl.uniform1i(uniforms.u_useTexture, this.texture ? 1 : 0);
        if (this.texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.uniform1i(uniforms.u_texture, 0);
        }
        for (const [buffer, location, size] of [
            [this.positionBuffer, attribs.a_position, 3],
            [this.normalBuffer, attribs.a_normal, 3],
            [this.colorBuffer, attribs.a_color, 4],
            [this.uvBuffer, attribs.a_uv, 2],
        ]) {
            if (location === undefined || location < 0) continue;
            if (buffer) {
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.enableVertexAttribArray(location);
                gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
            } else {
                gl.disableVertexAttribArray(location);
                gl.vertexAttrib4f(location, 1, 1, 1, 1);
            }
        }
        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }

    dispose() {
        for (const buffer of [this.positionBuffer, this.normalBuffer, this.colorBuffer, this.uvBuffer]) {
            if (buffer) this.gl.deleteBuffer(buffer);
        }
        if (this.texture) this.gl.deleteTexture(this.texture);
    }

    static plane(gl) {
        return new Mesh(gl,
            [-0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5,
                -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5],
            [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    }

    // Cilindro de raio 1 e altura 1, com a base em y = 0 (escale por (r, h, r)).
    // Só tampa de cima: a base nunca é vista, pois o chão já está embaixo.
    static cylinder(gl, segments = 32) {
        const positions = [], normals = [];
        const point = (angle, y) => [Math.cos(angle), y, Math.sin(angle)];
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * 2 * Math.PI, a1 = ((i + 1) / segments) * 2 * Math.PI;
            const b0 = point(a0, 0), b1 = point(a1, 0), t0 = point(a0, 1), t1 = point(a1, 1);
            const side = (angle, vertex) => [Math.cos(angle), 0, Math.sin(angle)];
            Mesh.pushTriangle(positions, normals, [b1, b0, t0], [side(a1), side(a0), side(a0)]);
            Mesh.pushTriangle(positions, normals, [b1, t0, t1], [side(a1), side(a0), side(a1)]);
            const up = [0, 1, 0];
            Mesh.pushTriangle(positions, normals, [[0, 1, 0], t1, t0], [up, up, up]);
        }
        return new Mesh(gl, positions, normals);
    }

    // Esfera de raio 1 centrada na origem (escale para obter elipsoides).
    // hemisphere = true gera só a metade de cima (y ≥ 0), aberta embaixo.
    static sphere(gl, rings = 10, segments = 14, hemisphere = false) {
        const positions = [], normals = [];
        const limit = hemisphere ? Math.floor(rings / 2) : rings;
        const point = (ring, segment) => {
            const phi = (ring / rings) * Math.PI, theta = (segment / segments) * 2 * Math.PI;
            return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
        };
        for (let r = 0; r < limit; r++) {
            for (let s = 0; s < segments; s++) {
                const a = point(r, s), b = point(r + 1, s), c = point(r + 1, s + 1), d = point(r, s + 1);
                if (r > 0) Mesh.pushTriangle(positions, normals, [a, b, d], [a, b, d]);
                if (r < rings - 1) Mesh.pushTriangle(positions, normals, [d, b, c], [d, b, c]);
            }
        }
        return new Mesh(gl, positions, normals);
    }

    // Garante que o triângulo fique com a face frontal (anti-horária) voltada para a normal.
    static pushTriangle(positions, normals, vertices, vertexNormals) {
        const [a, b, c] = vertices;
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const n = vertexNormals[0].map((_, axis) => vertexNormals.reduce((sum, normal) => sum + normal[axis], 0));
        const flip = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
        const order = flip ? [0, 2, 1] : [0, 1, 2];
        for (const i of order) {
            positions.push(...vertices[i]);
            normals.push(...vertexNormals[i]);
        }
    }

    static box(gl) {
        const positions = [], normals = [];
        const faces = [
            [[0, 0, 1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
            [[0, 0, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
            [[1, 0, 0], [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
            [[-1, 0, 0], [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
            [[0, 1, 0], [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
            [[0, -1, 0], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
        ];
        for (const [normal, ...vertices] of faces) {
            for (const index of [0, 1, 2, 0, 2, 3]) {
                positions.push(...vertices[index].map(value => value * 0.5));
                normals.push(...normal);
            }
        }
        return new Mesh(gl, positions, normals);
    }
}
