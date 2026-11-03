// 3D view of one real depth capture (assets/licam/capture.js): drag-to-rotate on the LiCam page,
// a gently swaying preview on the project cards (.viewer--card).
// Plain WebGL, no libraries. If anything is unsupported the still image stays on screen.
(() => {
  const frames = Array.from(document.querySelectorAll('.viewer'));
  if (!frames.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Kinect-style depth frame: 640 x 480, uint16 millimetres, 0 = no reading
  const W = 640;
  const H = 480;
  const FOCAL = 585;
  const EDGE_MM = 80;

  // Same purple ramp as the still image: near = light lavender, far = deep purple
  const STOPS = [
    [0.0, [214, 196, 250]], [0.35, [160, 126, 232]], [0.65, [110, 70, 200]],
    [0.88, [57, 30, 120]], [1.0, [26, 13, 61]]
  ];
  const ramp = (t) => {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < STOPS.length - 1; i++) {
      const [a, ca] = STOPS[i];
      const [b, cb] = STOPS[i + 1];
      if (t <= b) {
        const f = (t - a) / (b - a);
        return ca.map((c, k) => Math.round(c + (cb[k] - c) * f));
      }
    }
    return STOPS[STOPS.length - 1][1];
  };

  async function loadDepth() {
    const bytes = Uint8Array.from(atob(window.LICAM_DEPTH_B64), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint16Array(await new Response(stream).arrayBuffer());
  }

  // Turn the depth grid into points (metres), dropping empty pixels and stray edge pixels
  function buildPoints(depth) {
    const sorted = Array.from(depth).filter((v) => v > 0).sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.02)];
    const hi = sorted[Math.floor(sorted.length * 0.98)];
    const mid = sorted[Math.floor(sorted.length / 2)];

    const positions = new Float32Array(depth.length * 3);
    const colors = new Uint8Array(depth.length * 3);
    let count = 0;

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const z = depth[i];
        if (!z) continue;
        const flying = [depth[i - 1], depth[i + 1], depth[i - W], depth[i + W]]
          .some((n) => n && Math.abs(n - z) > EDGE_MM);
        if (flying) continue;

        positions[count * 3] = ((x - W / 2) * z) / FOCAL / 1000;
        positions[count * 3 + 1] = (-(y - H / 2) * z) / FOCAL / 1000;
        positions[count * 3 + 2] = -(z - mid) / 1000;
        const [r, g, b] = ramp((z - lo) / (hi - lo));
        colors[count * 3] = r;
        colors[count * 3 + 1] = g;
        colors[count * 3 + 2] = b;
        count++;
      }
    }
    return { positions: positions.subarray(0, count * 3), colors: colors.subarray(0, count * 3), count, mid };
  }

  // Column-major 4x4 helpers
  const mul = (a, b) => {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
        out[c * 4 + r] = sum;
      }
    }
    return out;
  };
  const rotX = (a) => new Float32Array([1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1]);
  const rotY = (a) => new Float32Array([Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]);
  const translate = (z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1]);
  const perspective = (fov, aspect, near, far) => {
    const f = 1 / Math.tan(fov / 2);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
  };

  function start(frame, points) {
    const canvas = frame.querySelector('canvas');
    const resetButton = frame.querySelector('.viewer__reset');
    const hint = frame.querySelector('.viewer__hint');
    const isCard = frame.classList.contains('viewer--card');

    const gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) throw new Error('no webgl');

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, `
      attribute vec3 p;
      attribute vec3 c;
      uniform mat4 m;
      uniform float k;
      varying vec3 vc;
      void main() {
        vec4 q = m * vec4(p, 1.0);
        gl_Position = q;
        gl_PointSize = max(1.5, k / q.w);
        vc = c;
      }`));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vc;
      void main() { gl_FragColor = vec4(vc, 1.0); }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link failed');
    gl.useProgram(program);

    const bind = (name, data, type, normalize) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, type, normalize, 0, 0);
    };
    bind('p', points.positions, gl.FLOAT, false);
    bind('c', points.colors, gl.UNSIGNED_BYTE, true);

    const matrixLoc = gl.getUniformLocation(program, 'm');
    const sizeLoc = gl.getUniformLocation(program, 'k');
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.11, 0.11, 0.118, 1);

    const HOME = { yaw: 0.45, pitch: 0.12 };
    // Camera sits a little behind where the sensor was, so the whole scene stays in view while rotating
    const SENSOR = points.mid / 1000;
    const DISTANCE = SENSOR * 1.3;
    const state = { ...HOME, auto: !reduceMotion };
    let drawing = false;
    let visible = true;

    function draw(time) {
      drawing = false;
      if (state.auto) {
        state.yaw = HOME.yaw * Math.sin((time || 0) / 1800);
        state.pitch = HOME.pitch;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const proj = perspective(Math.PI / 4, width / height, 0.1, 20);
      const model = mul(translate(-DISTANCE), mul(rotX(state.pitch), rotY(state.yaw)));
      gl.uniformMatrix4fv(matrixLoc, false, mul(proj, model));
      gl.uniform1f(sizeLoc, SENSOR * 1.6 * (height / H));
      gl.drawArrays(gl.POINTS, 0, points.count);

      if (state.auto) request();
    }
    function request() {
      if (drawing || !visible) return;
      drawing = true;
      requestAnimationFrame(draw);
    }

    const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v));
    const stopAuto = () => {
      if (!state.auto) return;
      state.auto = false;
      if (hint) hint.hidden = true;
    };

    // Project cards are plain previews: the surrounding link handles clicks
    if (!isCard) {
      let drag = null;
      canvas.addEventListener('pointerdown', (event) => {
        drag = { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
        try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* not an active pointer */ }
        stopAuto();
        frame.classList.add('is-dragging');
      });
      canvas.addEventListener('pointermove', (event) => {
        if (!drag) return;
        state.yaw = clamp(state.yaw + (event.clientX - drag.x) * 0.006, 0.9);
        // Touch keeps vertical swipes for scrolling the page
        if (!drag.touch) state.pitch = clamp(state.pitch + (event.clientY - drag.y) * 0.006, 0.9);
        drag.x = event.clientX;
        drag.y = event.clientY;
        request();
      });
      const endDrag = () => { drag = null; frame.classList.remove('is-dragging'); };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);

      canvas.addEventListener('keydown', (event) => {
        const step = 0.12;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (!moves[event.key]) return;
        event.preventDefault();
        stopAuto();
        state.yaw = clamp(state.yaw + moves[event.key][0], 0.9);
        state.pitch = clamp(state.pitch + moves[event.key][1], 0.9);
        request();
      });

      if (resetButton) {
        resetButton.addEventListener('click', () => {
          stopAuto();
          state.yaw = HOME.yaw;
          state.pitch = HOME.pitch;
          request();
        });
      }
    }

    if ('ResizeObserver' in window) new ResizeObserver(request).observe(canvas);
    // Don't animate cards that are scrolled out of view
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) request();
      }).observe(frame);
    }
    request();
  }

  loadDepth()
    .then((depth) => {
      const points = buildPoints(depth);
      frames.forEach((frame) => {
        try {
          start(frame, points);
          frame.classList.add('is-live');
        } catch (error) {
          console.warn('LiCam 3D view unavailable, showing the still image.', error);
        }
      });
    })
    .catch((error) => console.warn('LiCam 3D view unavailable, showing the still image.', error));
})();
