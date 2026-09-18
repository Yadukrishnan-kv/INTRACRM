import { escapeHtml, WarrantyVerifyView } from './warranty-types';

export const PORTAL_STYLE = `
:root { color-scheme: light; --ink:#12202b; --muted:#5b6b76; --line:#d7dee4; --ok:#0b7a4b; --bad:#b42318; --bg:#f4f7f9; --card:#fff; --accent:#0f4c5c; }
* { box-sizing: border-box; }
body { margin:0; font-family: "Segoe UI", system-ui, sans-serif; background:var(--bg); color:var(--ink); }
.wrap { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }
.brand { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
h1 { font-size: 28px; margin: 8px 0 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 20px; }
label { display:block; font-size:13px; margin-bottom:6px; color:var(--muted); }
input, textarea { width:100%; padding:12px 14px; border:1px solid var(--line); border-radius:10px; font: inherit; }
.row { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
button, .btn { appearance:none; border:0; border-radius:10px; padding:12px 16px; font: inherit; font-weight:600; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
.primary { background: var(--accent); color:#fff; }
.ghost { background:#e8eef1; color:var(--ink); }
.ok { color: var(--ok); font-weight: 700; }
.bad { color: var(--bad); font-weight: 700; }
.meta { color: var(--muted); margin: 4px 0; }
video, canvas { width:100%; border-radius:12px; background:#000; }
.hidden { display:none; }
ul { padding-left: 18px; }
.err { color: var(--bad); min-height: 1.2em; margin-top: 8px; }
`;

function layout(title: string, root: string, body: string, withScript: boolean): string {
  const script = withScript
    ? `<script src="${escapeHtml(root)}/jsqr.js" defer></script><script src="${escapeHtml(root)}/portal.js" defer></script>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="Permissions-Policy" content="camera=(self)"/>
  <title>${escapeHtml(title)}</title>
  <style>${PORTAL_STYLE}</style>
</head>
<body data-root="${escapeHtml(root)}">
  <main class="wrap">${body}</main>
  ${script}
</body>
</html>`;
}

export function renderPortalHomeHtml(root: string): string {
  return layout(
    'Verify warranty',
    root,
    `<p class="brand">INTRA LEADS</p>
     <h1>Verify a warranty</h1>
     <section class="card">
       <p class="meta">Scan the QR on the card, upload a photo of the QR, or paste the verification URL.</p>
       <label for="code">Verification URL or token</label>
       <input id="code" autocomplete="off" placeholder="Paste URL or token"/>
       <p class="err" id="error"></p>
       <div class="row">
         <button class="primary" id="verify" type="button">Verify warranty</button>
         <button class="ghost" id="scan" type="button">Scan QR</button>
         <label class="ghost btn" for="file">Upload QR photo</label>
         <input id="file" class="hidden" type="file" accept="image/*" capture="environment"/>
       </div>
       <video id="preview" class="hidden" playsinline autoplay muted></video>
     </section>`,
    true,
  );
}

export function renderPortalResultHtml(view: WarrantyVerifyView, root: string, token: string): string {
  const active = view.valid && view.status === 'active';
  const items = view.items
    .map(
      (item) =>
        `<li>${escapeHtml(item.description)}${
          item.serialNumber ? ` · SN ${escapeHtml(item.serialNumber)}` : ''
        }</li>`,
    )
    .join('');
  const pdfHref = `${root}/${token}/pdf`;
  return layout(
    `Warranty ${view.cardNumber}`,
    root,
    `<p class="brand">${escapeHtml(view.tenantName)}</p>
     <h1>Warranty ${escapeHtml(view.cardNumber)}</h1>
     <section class="card">
       <p class="${active ? 'ok' : 'bad'}">${active ? 'Verified · ' : ''}${escapeHtml(view.statusLabel)}</p>
       ${view.customerName ? `<p class="meta">Customer: ${escapeHtml(view.customerName)}</p>` : ''}
       ${view.serialNumber ? `<p class="meta">Serial: ${escapeHtml(view.serialNumber)}</p>` : ''}
       ${view.purchasedOn ? `<p class="meta">Purchased: ${escapeHtml(view.purchasedOn)}</p>` : ''}
       <p class="meta">Valid ${escapeHtml(view.warrantyStartOn)} to ${escapeHtml(view.warrantyEndOn)}</p>
       ${view.coverageNotes ? `<p class="meta">${escapeHtml(view.coverageNotes)}</p>` : ''}
       <ul>${items || '<li>No line items</li>'}</ul>
       <div class="row">
         <a class="primary btn" href="${escapeHtml(pdfHref)}">Download PDF</a>
         <a class="ghost btn" href="${escapeHtml(root)}">Verify another</a>
       </div>
     </section>`,
    false,
  );
}

export function renderPortalNotFoundHtml(root: string): string {
  return layout(
    'Warranty not found',
    root,
    `<p class="brand">INTRA LEADS</p>
     <h1>Warranty not found</h1>
     <section class="card">
       <p class="bad">This verification link is invalid or the card is no longer available.</p>
       <div class="row"><a class="primary btn" href="${escapeHtml(root)}">Verify another</a></div>
     </section>`,
    false,
  );
}

export const PORTAL_JS = `"use strict";
(function () {
  var root = document.body.getAttribute("data-root") || "";
  var input = document.getElementById("code");
  var error = document.getElementById("error");
  var preview = document.getElementById("preview");
  var stream = null;
  var scanning = false;

  function showError(message) {
    if (error) error.textContent = message || "";
  }

  function parseToken(raw) {
    var value = (raw || "").trim();
    var match = value.match(new RegExp("public/warranty/([a-fA-F0-9]{48})(?:/|$|\\\\?|#)"));
    if (match && match[1]) return match[1].toLowerCase();
    if (/^[a-fA-F0-9]{48}$/.test(value)) return value.toLowerCase();
    return null;
  }

  function go(raw) {
    var token = parseToken(raw);
    if (!token) {
      showError("Enter a valid verification URL or token.");
      return;
    }
    stopScan();
    window.location.href = root + "/" + token + "/view";
  }

  function stopScan() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    if (preview) preview.classList.add("hidden");
  }

  function decodeCanvas(canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx || typeof jsQR !== "function") return null;
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var result = jsQR(image.data, image.width, image.height);
    return result && result.data ? result.data : null;
  }

  async function detectBitmap(bitmap) {
    if (window.BarcodeDetector) {
      try {
        var detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        var codes = await detector.detect(bitmap);
        if (codes && codes[0] && codes[0].rawValue) return codes[0].rawValue;
      } catch (err) {}
    }
    var canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    var ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
      return decodeCanvas(canvas);
    }
    return null;
  }

  async function tick(video) {
    if (!scanning || !video) return;
    if (video.readyState >= 2) {
      if (window.BarcodeDetector) {
        try {
          var detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          var codes = await detector.detect(video);
          if (codes && codes[0] && codes[0].rawValue) {
            go(codes[0].rawValue);
            return;
          }
        } catch (err) {}
      }
      var canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      var ctx = canvas.getContext("2d");
      if (ctx && canvas.width) {
        ctx.drawImage(video, 0, 0);
        var found = decodeCanvas(canvas);
        if (found) {
          go(found);
          return;
        }
      }
    }
    requestAnimationFrame(function () { tick(video); });
  }

  async function startScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("Camera is not available. Upload a QR photo or paste the URL.");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      if (!preview) return;
      preview.srcObject = stream;
      preview.classList.remove("hidden");
      await preview.play();
      scanning = true;
      tick(preview);
    } catch (err) {
      showError("Camera permission was denied. Upload a QR photo instead.");
    }
  }

  var verify = document.getElementById("verify");
  if (verify) verify.addEventListener("click", function () { go(input && input.value); });
  if (input) input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") go(input.value);
  });
  var scan = document.getElementById("scan");
  if (scan) scan.addEventListener("click", startScan);
  var file = document.getElementById("file");
  if (file) file.addEventListener("change", async function (event) {
    var picked = event.target.files && event.target.files[0];
    if (!picked) return;
    try {
      var bitmap = await createImageBitmap(picked);
      var value = await detectBitmap(bitmap);
      if (value) go(value);
      else showError("No QR code found in that photo.");
    } catch (err) {
      showError("Could not read that image.");
    }
  });
})();
`;
