# Local OCR assets

Tesseract.js 6.0.1 worker and tesseract.js-core 6.0.0 runtime are vendored from the npm dependencies. Licenses are in this directory. Language models `eng`, `pol`, and `ukr` are from https://tessdata.projectnaptha.com/4.0.0_fast/ (Tesseract tessdata, Apache-2.0).

The browser loads these files from MONETA's own origin on the first image import. No image or recognized text is uploaded. The worker terminates after each extraction or when the import view closes. Models may be cached locally by Tesseract. Code is loaded lazily; the ~36 MB asset directory does not load on the dashboard.

When updating Tesseract, replace the matching worker and all four core variants together and run the real OCR browser check. Do not point workerPath/corePath/langPath to a third-party OCR service.
