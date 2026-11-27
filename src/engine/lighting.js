// Utilitários de iluminação da engine. Um objeto de iluminação (em espaço de mundo) tem o formato:
// {
//   eye: [x, y, z],                       posição do observador
//   ambient: [r, g, b],                   Ia
//   sun: { direction: [x, y, z], color }, luz direcional (direction aponta PARA a luz)
//   light: { position, direction, color, attenuation: [c, l, q], innerCos, outerCos },
// }
// Luz omnidirecional: cossenos fora de [-1, 1] fazem o cone cobrir todas as direções (sem ponto cego).
export const OMNI_INNER_COS = -1.1;
export const OMNI_OUTER_COS = -1.2;

export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpVector = (a, b, t) => a.map((value, i) => lerp(value, b[i], t));

export function normalize(v) {
    const length = Math.hypot(...v) || 1;
    return v.map(value => value / length);
}

// Matrizes column-major 4×4.
export function transformPoint(m, [x, y, z]) {
    return [0, 1, 2].map(row => m[row] * x + m[4 + row] * y + m[8 + row] * z + m[12 + row]);
}

export function transformDirection(m, [x, y, z]) {
    return [0, 1, 2].map(row => m[row] * x + m[4 + row] * y + m[8 + row] * z);
}

// Envia a iluminação aos uniforms do shader. Com `space` (uma matriz de visão), posições e direções
// são convertidas para o espaço da câmera: é o que a passagem FPS precisa, pois nela as armas
// são desenhadas com u_view = identidade, ou seja, em coordenadas de câmera.
export function applyLighting(gl, uniforms, lighting, space = null) {
    const point = p => (space ? transformPoint(space, p) : p);
    const direction = d => normalize(space ? transformDirection(space, d) : d);
    const { light, sun } = lighting;
    gl.uniform3fv(uniforms.u_viewPos, point(lighting.eye));
    gl.uniform3fv(uniforms.u_ambient, lighting.ambient);
    gl.uniform3fv(uniforms.u_sunDir, direction(sun.direction));
    gl.uniform3fv(uniforms.u_sunColor, sun.color);
    gl.uniform3fv(uniforms.u_lightPos, point(light.position));
    gl.uniform3fv(uniforms.u_lightDir, direction(light.direction));
    gl.uniform3fv(uniforms.u_lightColor, light.color);
    gl.uniform3fv(uniforms.u_lightAtten, light.attenuation);
    gl.uniform2f(uniforms.u_lightCone, light.innerCos, light.outerCos);
}
