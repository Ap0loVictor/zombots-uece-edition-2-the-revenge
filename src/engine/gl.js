export function initGL(canvas) {
    // GLSL ES 1.00 e WebGL 1, compatíveis com a base de referência.
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL indisponível. Verifique a aceleração gráfica do navegador.');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.075, 0.11, 0.15, 1);
    resizeCanvas(gl);
    return gl;
}

export function resizeCanvas(gl) {
    const canvas = gl.canvas;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
}
