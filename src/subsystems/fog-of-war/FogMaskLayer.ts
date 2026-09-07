/**
 * FogMaskLayer — the visual heart of the product.
 *
 * The map is rendered as two stacked MapLibre canvases:
 *
 *   [bottom]  "revealed" map — vivid satellite imagery / rich terrain
 *   [top]     "fog" map      — a pale, desaturated cartographic survey
 *
 * This custom layer lives at the very top of the *fog* map's layer stack and
 * erases that canvas to transparency wherever the user has actually explored,
 * letting the vivid world beneath show through. The erase is feathered, so the
 * boundary reads as an organic, hand-revealed edge rather than a hard cutout.
 *
 * Rendering is two-pass so that overlapping reveals union cleanly:
 *
 *   Pass 1 (prerender): every reveal "stamp" is drawn as a soft radial disc into
 *     an offscreen coverage buffer using blendEquation(MAX). MAX means two
 *     overlapping soft discs produce the *greater* coverage rather than summing,
 *     so a route made of hundreds of overlapping stamps has one smooth outer
 *     feather instead of a lumpy, seam-ridden blob.
 *
 *   Pass 2 (render): a fullscreen quad samples that coverage and erases the fog
 *     canvas with destination-out blending.
 *
 * Stamps are positioned in Mercator world space and sized in Mercator units, so
 * a reveal is a fixed *geographic* area — it grows and shrinks correctly as the
 * user zooms, exactly like real explored ground.
 */

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';

/** One reveal stamp in Mercator world space. */
export interface FogStamp {
  /** Mercator x in [0,1]. */
  x: number;
  /** Mercator y in [0,1]. */
  y: number;
  /** Reveal radius in Mercator units. */
  radius: number;
  /**
   * Coverage strength in [0,1]. Confident reveals (dense GPS, repeated visits)
   * approach 1 and erase the fog completely; low-confidence reveals stay below 1
   * and leave the territory partially veiled.
   */
  strength: number;
}

/**
 * Floats per stamp vertex: centre.x, centre.y, corner.x, corner.y, radius,
 * strength.
 *
 * The corner stays a *unit* [-1,1] direction and the radius travels as its own
 * attribute. Folding the radius into the corner would save four bytes a vertex
 * but would leave the fragment shader interpolating a Mercator-scale offset
 * (~1e-6) instead of a unit distance, which collapses the radial falloff.
 */
const FLOATS_PER_VERTEX = 6;
const VERTS_PER_STAMP = 6;

const STAMP_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_center;   // mercator position
layout(location = 1) in vec2 a_corner;   // unit-quad corner in [-1,1]
layout(location = 2) in float a_radius;  // reveal radius in mercator units
layout(location = 3) in float a_strength;

uniform mat4 u_matrix;
uniform float u_radius_scale;
uniform float u_min_radius;

out vec2 v_corner;
out float v_strength;

void main() {
  // Passed through as a unit direction so the fragment shader can measure a
  // normalised radial distance regardless of how large the stamp is.
  v_corner = a_corner;
  v_strength = a_strength;
  // Zoomed out far enough, a true-to-scale road corridor is thinner than a
  // pixel and exploration disappears into aliased scratches. Enforcing a
  // minimum on-screen radius is the same convention cartography already uses
  // for roads and rivers: the feature stays visible at small scale, and the
  // geographic radius takes over as soon as it is the larger of the two.
  float radius = max(a_radius, u_min_radius);
  vec2 pos = a_center + a_corner * radius * u_radius_scale;
  gl_Position = u_matrix * vec4(pos, 0.0, 1.0);
}
`;

const STAMP_FRAG = `#version 300 es
precision highp float;

in vec2 v_corner;
in float v_strength;

uniform float u_feather;

out vec4 fragColor;

void main() {
  // Radial falloff across the stamp. u_feather controls how much of the disc is
  // solid before the edge starts fading, which is what gives the reveal its soft
  // "breathed onto the paper" boundary instead of a stencil edge.
  float d = length(v_corner);
  float coverage = 1.0 - smoothstep(u_feather, 1.0, d);
  fragColor = vec4(coverage * v_strength, 0.0, 0.0, 1.0);
}
`;

const COMPOSITE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos; // fullscreen triangle in clip space

out vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Erases the fog canvas using the coverage buffer.
 *
 * Output alpha is the coverage; with destination-out blending
 * (ZERO, ONE_MINUS_SRC_ALPHA) the fog canvas becomes
 * `dst * (1 - coverage)` — fully transparent where exploration is confident,
 * partially transparent at the feathered rim.
 */
const COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_coverage;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  float coverage = texture(u_coverage, v_uv).r;
  fragColor = vec4(0.0, 0.0, 0.0, coverage * u_opacity);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('FogMaskLayer: could not create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`FogMaskLayer: shader compile failed — ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('FogMaskLayer: could not create program');
  const vs = compile(gl, gl.VERTEX_SHADER, vert);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`FogMaskLayer: program link failed — ${log}`);
  }
  return program;
}

export interface FogMaskLayerOptions {
  id?: string;
  /**
   * Fraction of each stamp that stays fully solid before the edge fades.
   * Lower values give a wider, softer halo.
   */
  feather?: number;
  /**
   * Global reveal strength. Below 1 the fog never fully clears, which is how the
   * "partially explored" presentation is expressed.
   */
  opacity?: number;
  /**
   * Smallest on-screen reveal radius, in CSS pixels. Keeps thin corridors
   * legible when zoomed out instead of aliasing away to nothing.
   */
  minRadiusPixels?: number;
}

export class FogMaskLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;

  private stampProgram: WebGLProgram | null = null;
  private compositeProgram: WebGLProgram | null = null;

  private stampVao: WebGLVertexArrayObject | null = null;
  private stampBuffer: WebGLBuffer | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;

  private coverageFbo: WebGLFramebuffer | null = null;
  private coverageTexture: WebGLTexture | null = null;
  private coverageWidth = 0;
  private coverageHeight = 0;

  private vertexData = new Float32Array(0);
  private stampCount = 0;
  private bufferDirty = false;

  private feather: number;
  private opacity: number;
  private minRadiusPixels: number;

  /** True once onAdd has succeeded; guards render calls after context loss. */
  private ready = false;

  /** Counters surfaced to the verification harness so a silent no-op is visible. */
  readonly debug = {
    onAdd: 0,
    prerender: 0,
    render: 0,
    drawn: 0,
    stamps: 0,
    lastError: '',
    lastMatrix: [] as number[],
    matrixType: '',
    firstVertex: [] as number[],
    canvas: [] as number[],
    mainMatrix: [] as number[],
    tileMercatorCoords: [] as number[],
  };

  constructor(options: FogMaskLayerOptions = {}) {
    this.id = options.id ?? 'fog-mask';
    this.feather = options.feather ?? 0.45;
    this.opacity = options.opacity ?? 1;
    this.minRadiusPixels = options.minRadiusPixels ?? 2.6;
  }

  /**
   * Replace the reveal set. Called whenever exploration changes — a new GPS fix,
   * a loaded history, a deleted trip. The GPU buffer is rebuilt lazily on the
   * next frame so a burst of updates costs one upload, not one per update.
   */
  setStamps(stamps: readonly FogStamp[]): void {
    const floats = stamps.length * VERTS_PER_STAMP * FLOATS_PER_VERTEX;
    if (this.vertexData.length < floats) {
      // Grow with headroom so live tracking doesn't reallocate every fix.
      this.vertexData = new Float32Array(Math.ceil(floats * 1.5));
    }
    const data = this.vertexData;
    // Unit-quad corners as two triangles.
    const corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    let o = 0;
    for (const stamp of stamps) {
      for (let c = 0; c < VERTS_PER_STAMP; c++) {
        data[o++] = stamp.x;
        data[o++] = stamp.y;
        data[o++] = corners[c * 2]!;
        data[o++] = corners[c * 2 + 1]!;
        data[o++] = stamp.radius;
        data[o++] = stamp.strength;
      }
    }
    this.stampCount = stamps.length;
    this.debug.stamps = stamps.length;
    this.bufferDirty = true;
    this.map?.triggerRepaint();
  }

  /**
   * Sample the coverage buffer. Used by the verification harness to prove the
   * mask actually contains reveal data, so a blank-looking map can be diagnosed
   * as "no coverage" versus "coverage present but not composited".
   */
  readCoverageStats(): { max: number; nonZero: number; total: number } | null {
    const gl = this.gl;
    if (!gl || !this.coverageFbo) return null;
    const w = this.coverageWidth;
    const h = this.coverageHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.coverageFbo);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let max = 0;
    let nonZero = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = px[i]!;
      if (v > 0) nonZero++;
      if (v > max) max = v;
    }
    return { max, nonZero, total: w * h };
  }

  setFeather(feather: number): void {
    this.feather = feather;
    this.map?.triggerRepaint();
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext | WebGLRenderingContext): void {
    if (!(gl instanceof WebGL2RenderingContext)) {
      // Fail loudly rather than silently rendering an unmasked map, which would
      // misrepresent unexplored territory as explored.
      throw new Error('FogMaskLayer requires a WebGL2 context');
    }
    this.map = map;
    this.gl = gl;

    this.stampProgram = link(gl, STAMP_VERT, STAMP_FRAG);
    this.compositeProgram = link(gl, COMPOSITE_VERT, COMPOSITE_FRAG);

    this.stampBuffer = gl.createBuffer();
    this.stampVao = gl.createVertexArray();
    gl.bindVertexArray(this.stampVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stampBuffer);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);

    this.quadBuffer = gl.createBuffer();
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), // oversized triangle covers the viewport
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    this.ready = true;
    this.debug.onAdd++;
  }

  onRemove(): void {
    const gl = this.gl;
    this.ready = false;
    if (!gl) return;
    gl.deleteProgram(this.stampProgram);
    gl.deleteProgram(this.compositeProgram);
    gl.deleteBuffer(this.stampBuffer);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteVertexArray(this.stampVao);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteFramebuffer(this.coverageFbo);
    gl.deleteTexture(this.coverageTexture);
    this.stampProgram = null;
    this.compositeProgram = null;
    this.stampBuffer = null;
    this.quadBuffer = null;
    this.stampVao = null;
    this.quadVao = null;
    this.coverageFbo = null;
    this.coverageTexture = null;
    this.coverageWidth = 0;
    this.coverageHeight = 0;
    this.gl = null;
    this.map = null;
  }

  /** Scratch matrix, reused so the render loop allocates nothing per frame. */
  private readonly matrixScratch = new Float32Array(16);

  private toFloat32(m: ArrayLike<number>): Float32Array {
    for (let i = 0; i < 16; i++) this.matrixScratch[i] = m[i]!;
    return this.matrixScratch;
  }

  /** Recreate the coverage buffer when the canvas resizes. */
  private ensureCoverageTarget(gl: WebGL2RenderingContext, width: number, height: number): void {
    if (this.coverageFbo && this.coverageWidth === width && this.coverageHeight === height) return;

    if (this.coverageTexture) gl.deleteTexture(this.coverageTexture);
    if (this.coverageFbo) gl.deleteFramebuffer(this.coverageFbo);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Coverage only needs one channel, but RGBA8 is used because it is the one
    // colour-renderable format whose readPixels support is universal — which the
    // verification harness depends on to assert the mask is non-empty.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`FogMaskLayer: coverage framebuffer incomplete (0x${status.toString(16)})`);
    }

    this.coverageTexture = texture;
    this.coverageFbo = fbo;
    this.coverageWidth = width;
    this.coverageHeight = height;
  }

  /**
   * Pass 1 — accumulate reveal coverage into the offscreen buffer.
   *
   * This must happen in prerender because it rebinds the framebuffer; doing it
   * inside render would corrupt MapLibre's own draw target.
   */
  prerender(_gl: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput): void {
    const gl = this.gl;
    this.debug.prerender++;
    if (!this.ready || !gl || !this.stampProgram) return;

    const canvas = gl.canvas as HTMLCanvasElement;
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;

    this.ensureCoverageTarget(gl, width, height);

    if (this.bufferDirty && this.stampBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.stampBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);
      this.bufferDirty = false;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.coverageFbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.stampCount > 0) {
      gl.useProgram(this.stampProgram);
      gl.bindVertexArray(this.stampVao);

      // MapLibre leaves the stencil and scissor tests configured for tile
      // clipping. Inheriting that state would discard most or all of this draw,
      // so every test this pass does not want is explicitly turned off.
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      gl.enable(gl.BLEND);
      // MAX unions overlapping soft discs into one smooth shape. Additive
      // blending here would blow out overlaps and make routes look beaded.
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);

      // `defaultProjectionData.mainMatrix` is the matrix that takes *normalised
      // Mercator* [0,1] straight to clip space, which is the space the stamps
      // live in. `modelViewProjectionMatrix` looks like the obvious choice but
      // expects world-pixel coordinates (mercator × 512·2^zoom), so feeding it
      // mercator puts every stamp thousands of screens off-camera.
      //
      // MapLibre hands these out as Float64Array for precision; uniformMatrix4fv
      // only accepts Float32Array, and rejects the upload *silently*, leaving
      // u_matrix as identity.
      gl.uniformMatrix4fv(
        gl.getUniformLocation(this.stampProgram, 'u_matrix'),
        false,
        this.toFloat32(args.defaultProjectionData.mainMatrix as ArrayLike<number>),
      );
      // Radius is pre-multiplied into the vertex offsets, so the scale uniform
      // stays at 1 and exists only as a hook for reveal animations.
      gl.uniform1f(gl.getUniformLocation(this.stampProgram, 'u_radius_scale'), 1);
      gl.uniform1f(gl.getUniformLocation(this.stampProgram, 'u_feather'), this.feather);

      // MapLibre lays the world out across `512 · 2^zoom` CSS pixels, so this
      // converts a minimum pixel radius into the Mercator units the stamps use.
      // Device pixel ratio cancels out of the ratio and is deliberately omitted.
      const worldPixels = 512 * Math.pow(2, this.map?.getZoom() ?? 0);
      gl.uniform1f(
        gl.getUniformLocation(this.stampProgram, 'u_min_radius'),
        this.minRadiusPixels / worldPixels,
      );

      gl.drawArrays(gl.TRIANGLES, 0, this.stampCount * VERTS_PER_STAMP);
      this.debug.drawn++;
      if (this.debug.drawn <= 3) {
        // Sampled only on the first few frames: getError forces a pipeline sync,
        // so polling it every frame would itself destroy the frame budget.
        const err = gl.getError();
        if (err !== gl.NO_ERROR) this.debug.lastError = `coverage pass gl error 0x${err.toString(16)}`;
      }

      gl.blendEquation(gl.FUNC_ADD);
      gl.bindVertexArray(null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
  }

  /** Pass 2 — erase the fog canvas wherever coverage says the world is known. */
  render(_gl: WebGL2RenderingContext | WebGLRenderingContext, _args: CustomRenderMethodInput): void {
    const gl = this.gl;
    this.debug.render++;
    if (!this.ready || !gl || !this.compositeProgram || !this.coverageTexture) return;
    if (this.stampCount === 0) return;

    gl.useProgram(this.compositeProgram);
    gl.bindVertexArray(this.quadVao);

    // Same reasoning as the coverage pass: MapLibre's stencil/scissor state is
    // still bound here and would clip the fullscreen erase away.
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    // Destination-out: keep (1 - coverage) of whatever the fog map already drew.
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.coverageTexture);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_coverage'), 0);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_opacity'), this.opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Restore the blend state MapLibre expects for subsequent layers.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }
}
