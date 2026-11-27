export const Shaders = {
    vertexSource: `
        attribute vec3 a_position;
        attribute vec3 a_normal;
        attribute vec4 a_color;
        attribute vec2 a_uv;
        uniform mat4 u_model;
        uniform mat4 u_view;
        uniform mat4 u_projection;
        uniform mat3 u_normalMatrix;
        varying vec3 v_position;   // posição do fragmento no espaço "de mundo" da passagem atual
        varying vec3 v_normal;
        varying vec4 v_color;
        varying vec2 v_uv;
        void main() {
            vec4 world = u_model * vec4(a_position, 1.0);
            v_position = world.xyz;
            gl_Position = u_projection * u_view * world;
            v_normal = u_normalMatrix * a_normal;
            v_color = a_color;
            v_uv = a_uv;
        }
    `,

    // Modelo de reflexão de Phong por fragmento:
    //   I = Ka·Ia  +  Σ luzes [ Kd·(N·L) + Ks·(R·V)^n ] · atenuação · cone
    // com R = reflect(-L, N). Há uma luz pontual/spot móvel (a lanterna do capacete) e uma luz
    // direcional opcional (usada só no menu). Tudo é calculado no mesmo espaço dos vértices.
    fragmentSource: `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        uniform vec4 u_color;
        uniform bool u_useVertexColors;
        uniform bool u_useTexture;
        uniform sampler2D u_texture;

        uniform vec3 u_viewPos;      // posição do observador (câmera)
        uniform vec3 u_ambient;      // Ia (cor × intensidade)
        uniform vec3 u_sunDir;       // direção PARA a luz direcional (normalizada)
        uniform vec3 u_sunColor;     // zero = desligada
        uniform vec3 u_lightPos;     // luz pontual/spot
        uniform vec3 u_lightDir;     // direção do eixo do cone (normalizada)
        uniform vec3 u_lightColor;   // cor × intensidade; zero = desligada
        uniform vec3 u_lightAtten;   // constante, linear, quadrática
        uniform vec2 u_lightCone;    // cos(ângulo interno), cos(ângulo externo) — com externo = -1 vira omni
        uniform float u_specular;    // Ks (escalar do material)
        uniform float u_shininess;   // n, expoente de Phong
        uniform vec3 u_emissive;     // cor própria (lente da lanterna, projéteis)

        varying vec3 v_position;
        varying vec3 v_normal;
        varying vec4 v_color;
        varying vec2 v_uv;

        void main() {
            vec4 base = u_useVertexColors ? v_color : u_color;
            if (u_useTexture) base *= texture2D(u_texture, v_uv);

            vec3 N = normalize(v_normal);
            vec3 V = normalize(u_viewPos - v_position);

            // Ambiente
            vec3 result = u_ambient * base.rgb;

            // Luz direcional (menu)
            float sunDiffuse = max(dot(N, u_sunDir), 0.0);
            result += u_sunColor * base.rgb * sunDiffuse;

            // Luz pontual com cone (spot) e atenuação
            vec3 toLight = u_lightPos - v_position;
            float dist = length(toLight);
            vec3 L = toLight / max(dist, 1e-4);
            float attenuation = 1.0 / (u_lightAtten.x + u_lightAtten.y * dist + u_lightAtten.z * dist * dist);
            float spot = smoothstep(u_lightCone.y, u_lightCone.x, dot(-L, u_lightDir));
            float diffuse = max(dot(N, L), 0.0);
            vec3 R = reflect(-L, N);
            float specular = diffuse > 0.0 ? pow(max(dot(R, V), 0.0), u_shininess) : 0.0;
            result += u_lightColor * attenuation * spot * (base.rgb * diffuse + vec3(u_specular * specular));

            gl_FragColor = vec4(result + u_emissive, base.a);
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
        for (const name of ['a_position', 'a_normal', 'a_color', 'a_uv']) {
            attribs[name] = gl.getAttribLocation(program, name);
        }
        for (const name of ['u_model', 'u_view', 'u_projection', 'u_normalMatrix', 'u_color', 'u_useVertexColors',
            'u_useTexture', 'u_texture', 'u_viewPos', 'u_ambient', 'u_sunDir', 'u_sunColor', 'u_lightPos',
            'u_lightDir', 'u_lightColor', 'u_lightAtten', 'u_lightCone', 'u_specular', 'u_shininess', 'u_emissive']) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        return { program, attribs, uniforms };
    },
};
