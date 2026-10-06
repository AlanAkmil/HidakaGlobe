// Filter sensor ala kamera taktis, dibuat dengan post-process shader Cesium.
// Semua filter statis (tanpa animasi waktu) supaya tidak memaksa render terus-menerus.

export const SENSORS = [
  { id: "none", label: "Normal", hud: "NORMAL" },
  { id: "nvg", label: "Night vision", hud: "NVG" },
  { id: "flir", label: "FLIR termal", hud: "FLIR" },
  { id: "crt", label: "CRT", hud: "CRT" },
  { id: "noir", label: "Hitam putih", hud: "NOIR" },
];

const HEAD = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float vignette(vec2 uv, float a, float b) {
  return 1.0 - smoothstep(a, b, length(uv - 0.5));
}
`;

const SHADERS = {
  nvg:
    HEAD +
    `
void main(void) {
  vec2 uv = v_textureCoordinates;
  vec3 c = texture(colorTexture, uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  l = clamp(pow(l * 1.7, 0.85), 0.0, 1.0);
  vec2 res = czm_viewport.zw;
  float g = hash(floor(uv * res * 0.5)) - 0.5;
  l = clamp(l + g * 0.12, 0.0, 1.0);
  float vig = vignette(uv, 0.25, 0.85);
  vec3 col = vec3(0.12, 1.0, 0.28) * l * mix(0.35, 1.0, vig);
  out_FragColor = vec4(col, 1.0);
}
`,
  flir:
    HEAD +
    `
vec3 ramp(float t) {
  vec3 c0 = vec3(0.0, 0.0, 0.03);
  vec3 c1 = vec3(0.25, 0.0, 0.45);
  vec3 c2 = vec3(0.78, 0.1, 0.25);
  vec3 c3 = vec3(1.0, 0.5, 0.0);
  vec3 c4 = vec3(1.0, 0.9, 0.2);
  vec3 c5 = vec3(1.0, 1.0, 0.95);
  t = clamp(t, 0.0, 1.0) * 5.0;
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  if (t < 3.0) return mix(c2, c3, t - 2.0);
  if (t < 4.0) return mix(c3, c4, t - 3.0);
  return mix(c4, c5, t - 4.0);
}
void main(void) {
  vec2 uv = v_textureCoordinates;
  vec3 c = texture(colorTexture, uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  l = clamp((l - 0.08) * 1.35, 0.0, 1.0);
  vec3 col = ramp(l) * mix(0.55, 1.0, vignette(uv, 0.3, 0.9));
  out_FragColor = vec4(col, 1.0);
}
`,
  crt:
    HEAD +
    `
void main(void) {
  vec2 uv = v_textureCoordinates;
  vec2 res = czm_viewport.zw;
  vec2 off = vec2(1.5 / res.x, 0.0);
  float r = texture(colorTexture, uv + off).r;
  float g = texture(colorTexture, uv).g;
  float b = texture(colorTexture, uv - off).b;
  vec3 col = vec3(r, g, b);
  float scan = 0.82 + 0.18 * sin(uv.y * res.y * 1.5708);
  col *= scan;
  col *= mix(0.55, 1.05, vignette(uv, 0.35, 0.95));
  col = pow(col, vec3(0.95)) * 1.08;
  out_FragColor = vec4(col, 1.0);
}
`,
  noir:
    HEAD +
    `
void main(void) {
  vec2 uv = v_textureCoordinates;
  vec3 c = texture(colorTexture, uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  l = clamp((l - 0.5) * 1.25 + 0.5, 0.0, 1.0);
  float g = hash(floor(uv * czm_viewport.zw)) - 0.5;
  l = clamp(l + g * 0.04, 0.0, 1.0);
  l *= mix(0.6, 1.0, vignette(uv, 0.3, 0.9));
  out_FragColor = vec4(vec3(l), 1.0);
}
`,
};

// Uji kompilasi shader di konteks WebGL2 terpisah sebelum dipasang ke Cesium
function compiles(fs) {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return true;
    const sh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(
      sh,
      "#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform vec4 czm_viewport;\nout vec4 out_FragColor;\n" + fs
    );
    gl.compileShader(sh);
    const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
    if (!ok) console.warn("Shader filter gagal dikompilasi:", gl.getShaderInfoLog(sh));
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return !!ok;
  } catch (e) {
    return true;
  }
}

export function createSensor(viewer, Cesium, cb) {
  const scene = viewer.scene;
  let stage = null;
  let dead = false;

  const drop = () => {
    if (stage) {
      try {
        scene.postProcessStages.remove(stage);
      } catch (e) {
        /* abaikan */
      }
      stage = null;
    }
  };

  // Jaga-jaga: kalau shader menjatuhkan loop render, lepas filter dan hidupkan lagi
  const onRenderError = () => {
    if (dead || !stage) return;
    drop();
    try {
      viewer.useDefaultRenderLoop = true;
      const panel = viewer.container.querySelector(".cesium-widget-errorPanel");
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    } catch (e) {
      /* abaikan */
    }
    cb.notice("Filter ini tidak didukung perangkat lu, dikembalikan ke Normal.");
    cb.onFail();
  };
  scene.renderError.addEventListener(onRenderError);

  return {
    set(id) {
      if (dead || viewer.isDestroyed()) return;
      drop();
      const fs = SHADERS[id];
      if (fs) {
        if (!compiles(fs)) {
          cb.notice("Filter ini tidak didukung perangkat lu.");
          cb.onFail();
          return;
        }
        stage = scene.postProcessStages.add(
          new Cesium.PostProcessStage({ name: `hg-${id}`, fragmentShader: fs })
        );
      }
      scene.requestRender();
    },
    destroy() {
      dead = true;
      if (!viewer.isDestroyed()) {
        scene.renderError.removeEventListener(onRenderError);
        drop();
      }
    },
  };
}
