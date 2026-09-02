// pdf-parse v2 pulls in pdfjs-dist v5, which references DOMMatrix / Path2D /
// ImageData at *module-evaluation* time (e.g. `const SCALE_MATRIX = new
// DOMMatrix()` in its canvas layer). In a Vercel Node serverless runtime those
// browser globals do not exist, so the import throws `ReferenceError: DOMMatrix
// is not defined` before any of our code runs.
//
// ES `import` statements are hoisted and evaluated before sibling module code,
// so polyfilling inside parse.ts (above the `import ... from "pdf-parse"` line)
// is too late — pdfjs-dist has already been evaluated. This file must therefore
// be its own module and be imported *before* pdf-parse:
//
//   import "@/lib/bill/pdf-polyfill";
//   import { PDFParse } from "pdf-parse";
//
// @napi-rs/canvas is an optional dependency of pdfjs-dist and ships real
// implementations of these classes, so we prefer them and fall back to minimal
// stubs (enough for text extraction, which never rasterises).

/* eslint-disable @typescript-eslint/no-explicit-any */
let canvas: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  canvas = require("@napi-rs/canvas");
} catch {
  canvas = null;
}

const g = globalThis as any;

if (typeof g.DOMMatrix === "undefined") {
  g.DOMMatrix =
    canvas?.DOMMatrix ??
    class DOMMatrix {
      constructor() {}
      multiplySelf() {
        return this;
      }
      preMultiplySelf() {
        return this;
      }
      translate() {
        return this;
      }
      scale() {
        return this;
      }
      invertSelf() {
        return this;
      }
    };
}

if (typeof g.Path2D === "undefined") {
  g.Path2D =
    canvas?.Path2D ??
    class Path2D {
      addPath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      closePath() {}
      rect() {}
    };
}

if (typeof g.ImageData === "undefined") {
  g.ImageData =
    canvas?.ImageData ??
    class ImageData {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      constructor(width = 0, height = 0) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(Math.max(0, width * height * 4));
      }
    };
}

if (typeof g.DOMPoint === "undefined" && canvas?.DOMPoint) {
  g.DOMPoint = canvas.DOMPoint;
}
if (typeof g.DOMRect === "undefined" && canvas?.DOMRect) {
  g.DOMRect = canvas.DOMRect;
}

if (typeof (Promise as any).withResolvers === "undefined") {
  (Promise as any).withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
