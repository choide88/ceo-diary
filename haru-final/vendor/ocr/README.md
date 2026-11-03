# Browser OCR runtime

Pinned, self-hosted Tesseract.js 5.1.1, tesseract.js-core 5.1.1 (LSTM WASM),
and tessdata 4.0.0_fast Korean and English recognition models.

Sources:
- https://github.com/naptha/tesseract.js (Apache-2.0; LICENSE.tesseract.js)
- https://github.com/naptha/tesseract.js-core (Apache-2.0)
- https://github.com/tesseract-ocr/tessdata_fast (Apache-2.0)
- Models downloaded from https://tessdata.projectnaptha.com/4.0.0_fast/

Runtime files were obtained from the pinned jsDelivr npm distributions.
Only these public runtime/model files are bundled. No user image or financial
snapshot belongs in this directory or the repository. The worker, WASM and
language models load from the same origin; no remote OCR service, API key or
financial data transfer is involved. Model caching is disabled by the caller.
