import { Matrix4 } from './matrix.js';

export class Mesh {
    constructor(gl, vertexData, normalData, colorData = null) {
        this.gl = gl;
        this.vertexCount = vertexData.length / 3;
        this.positionBuffer = this.createBuffer(vertexData);
        this.normalBuffer = this.createBuffer(normalData);
        this.colorBuffer = colorData ? this.createBuffer(colorData) : null;
        this.modelMatrix = Matrix4.identity();
        this.color = [1, 1, 1, 1];
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
        gl.uniform1i(uniforms.u_useVertexColors, this.colorBuffer ? 1 : 0);
        for (const [buffer, location, size] of [
            [this.positionBuffer, attribs.a_position, 3],
            [this.normalBuffer, attribs.a_normal, 3],
            [this.colorBuffer, attribs.a_color, 4],
        ]) {
            if (location < 0) continue;
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
        for (const buffer of [this.positionBuffer, this.normalBuffer, this.colorBuffer]) {
            if (buffer) this.gl.deleteBuffer(buffer);
        }
    }

    static plane(gl) {
        return new Mesh(gl,
            [-0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5,
                -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5],
            [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
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
