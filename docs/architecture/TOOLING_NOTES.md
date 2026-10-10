## Tooling Pins

The npm `overrides` section in [`package.json`](/Users/bryceharmon/Desktop/Vidra/package.json) is intentionally pinned for tooling stability:

- `onnxruntime-node@1.19.2`
  Keeps GLiNER startup stable. Later versions introduced native binary changes that broke model loading at boot.

- `@xenova/transformers` and `@huggingface/transformers`
  Both are forced to use `onnxruntime-node@1.19.2` and `sharp@0.34.5` to avoid duplicate native binaries and peer dependency conflicts.

- `baseline-browser-mapping@2.9.18`
  Later versions caused resolution failures in the Vite build pipeline.

Do not add comment keys inside `overrides`. npm treats them as package names, which breaks architecture scripts that shell through npm.
