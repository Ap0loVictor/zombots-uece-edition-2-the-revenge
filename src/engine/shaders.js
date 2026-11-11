export const Shaders = {
    vertexSource: `
        attribute vec3 a_position;
        attribute vec3 a_normal;
        attribute vec4 a_color;
        uniform mat4 u_model;
        uniform mat4 u_view;
        uniform mat4 u_projection;
        uniform mat3 u_normalMatrix;
        varying vec3 v_normal;
        varying vec4 v_color;
        void main() {
            gl_Position = u_projection * u_view * u_model * vec4(a_position, 1.0);
            v_normal = u_normalMatrix * a_normal;
            v_color = a_color;
        }
    `,

    fragmentSource: `
        precision mediump float;
        uniform vec4 u_color;
        uniform bool u_useVertexColors;
        varying vec3 v_normal;
        varying vec4 v_color;
        void main() {
            vec4 color = u_useVertexColors ? v_color : u_color;
            vec3 lightDirection = normalize(vec3(-0.4, 1.0, 0.6));
            float diffuse = max(dot(normalize(v_normal), lightDirection), 0.0);
            gl_FragColor = vec4(color.rgb * (0.42 + 0.58 * diffuse), color.a);
        }
    `,

    compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Erro ao compilar shader: ${message}`);
        }
        return shader;
    },

    createProgram(gl) {
        const vertex = this.compileShader(gl, gl.VERTEX_SHADER, this.vertexSource);
        const fragment = this.compileShader(gl, gl.FRAGMENT_SHADER, this.fragmentSource);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(`Erro ao vincular shaders: ${message}`);
        }
        const attribs = {}, uniforms = {};
        for (const name of ['a_position', 'a_normal', 'a_color']) {
            attribs[name] = gl.getAttribLocation(program, name);
        }
        for (const name of ['u_model', 'u_view', 'u_projection', 'u_normalMatrix', 'u_color', 'u_useVertexColors']) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        return { program, attribs, uniforms };
    },
};
