import * as THREE from "three";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";

export interface RendererBundle {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  resize: (w: number, h: number) => void;
}

export function createRenderer(
  canvasHost: HTMLElement,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): RendererBundle {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; // handled by postprocessing ToneMappingEffect
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: 0,
  });
  composer.addPass(new RenderPass(scene, camera));

  // NOTE: SSAOEffect is intentionally omitted. In this postprocessing@6.39 /
  // three@0.170 combo it triggers a WebGL "feedback loop" between its depth
  // downsampling pass and the main framebuffer that blacks out the entire
  // frame (reproduced via headless screenshot QA, independent of GPU vs
  // software rendering). Revisit with a pinned/patched postprocessing
  // version or a custom SSAO pass before re-enabling.
  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: 1.05,
    luminanceSmoothing: 0.3,
    intensity: 0.6,
    kernelSize: KernelSize.LARGE,
  });

  const vignette = new VignetteEffect({ darkness: 0.4, offset: 0.35 });

  const toneMapping = new ToneMappingEffect({
    mode: ToneMappingMode.ACES_FILMIC,
  });

  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });

  composer.addPass(new EffectPass(camera, bloom, vignette, toneMapping, smaa));

  function resize(w: number, h: number) {
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }

  return { renderer, composer, resize };
}
