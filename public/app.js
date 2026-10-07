(function () {
  "use strict";

  const COLORS = [
    "#1a1a1a",
    "#444444",
    "#888888",
    "#cc0000",
    "#0066cc",
    "#2d8a4e",
    "#e8590c",
    "#7c3aed",
    "#0891b2",
    "#be185d",
  ];
  const TEXT_COLORS = [
    "#1a1a1a",
    "#444444",
    "#ffffff",
    "#cc0000",
    "#0066cc",
    "#2d8a4e",
    "#e8590c",
    "#7c3aed",
  ];
  const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24];

  let annotations = [];
  let nextId = 1;
  let currentCode = "";
  let currentLang = "javascript";
  let topZ = 1;

  const htmlEl = document.documentElement;
  const codeInput = document.getElementById("code-input");
  const langSelect = document.getElementById("language-select");
  const applyBtn = document.getElementById("apply-code-btn");
  const codeContent = document.getElementById("code-content");
  const codeDisplay = document.getElementById("code-display");
  const codeWrapper = document.getElementById("code-display-wrapper");
  const annotationsContainer = document.getElementById("annotations-container");
  const annotationCards = document.getElementById("annotation-cards");
  const selectionPopover = document.getElementById("selection-popover");
  const addAnnotationBtn = document.getElementById("add-annotation-btn");
  const downloadBtn = document.getElementById("download-btn");
  const exportArea = document.getElementById("export-area");
  const arrowsCanvas = document.getElementById("arrows-canvas");
  const themeToggle = document.getElementById("theme-toggle");
  const iconSun = document.getElementById("icon-sun");
  const iconMoon = document.getElementById("icon-moon");
  const prismDark = document.getElementById("prism-theme-dark");
  const prismLight = document.getElementById("prism-theme-light");
  const previewScroll = document.getElementById("preview-scroll");

  let pendingSelection = null;
  let drawnArrows = [];

  // === Theme ===
  function initTheme() {
    setTheme(localStorage.getItem("code-annotator-theme") || "light");
  }
  function setTheme(t) {
    htmlEl.setAttribute("data-theme", t);
    localStorage.setItem("code-annotator-theme", t);
    iconSun.style.display = t === "dark" ? "" : "none";
    iconMoon.style.display = t === "dark" ? "none" : "";
    prismDark.disabled = t !== "dark";
    prismLight.disabled = t !== "light";
    if (currentCode) {
      renderCode();
      raf2(drawOverlays);
    }
  }
  themeToggle.addEventListener("click", () =>
    setTheme(htmlEl.getAttribute("data-theme") === "dark" ? "light" : "dark"),
  );

  // === Show code in cards toggle ===
  const showCodeToggle = document.getElementById("show-code-toggle");
  showCodeToggle.addEventListener("change", () => {
    exportArea.classList.toggle("show-card-code", showCodeToggle.checked);
    requestAnimationFrame(() => {
      layoutCards();
      raf2(drawOverlays);
    });
  });

  applyBtn.addEventListener("click", applyCode);
  addAnnotationBtn.addEventListener("click", addAnnotation);
  downloadBtn.addEventListener("click", downloadPNG);

  // How to Use modal
  const howtoModal = document.getElementById("howto-modal");
  const howtoBtn = document.getElementById("howto-btn");
  const howtoCloseBtn = document.getElementById("howto-close-btn");
  howtoBtn.addEventListener("click", () => {
    howtoModal.style.display = "flex";
  });
  howtoCloseBtn.addEventListener("click", () => {
    howtoModal.style.display = "none";
  });
  howtoModal.addEventListener("click", (e) => {
    if (e.target === howtoModal) howtoModal.style.display = "none";
  });

  // === Smart editor keys ===
  codeInput.addEventListener("keydown", function (e) {
    const ta = this;
    const s = ta.selectionStart,
      end = ta.selectionEnd;
    const val = ta.value;

    // Tab → insert 2 spaces
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      ta.value = val.substring(0, s) + "  " + val.substring(end);
      ta.selectionStart = ta.selectionEnd = s + 2;
      return;
    }

    // Shift+Tab → dedent current line
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      const lineStart = val.lastIndexOf("\n", s - 1) + 1;
      const line = val.substring(lineStart);
      if (line.startsWith("  ")) {
        ta.value = val.substring(0, lineStart) + line.substring(2);
        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - 2);
      }
      return;
    }

    // Enter → auto-indent
    if (e.key === "Enter") {
      e.preventDefault();
      const lineStart = val.lastIndexOf("\n", s - 1) + 1;
      const line = val.substring(lineStart, s);
      const indent = line.match(/^(\s*)/)[1];
      const charBefore = val[s - 1];
      const charAfter = val[s];
      const openers = "{([";
      const closers = "})]";
      let extra = "";

      // Add indent after { ( [
      if (openers.includes(charBefore)) {
        extra = "  ";
        // If closing bracket is right after cursor, put it on a new line
        if (closers.includes(charAfter)) {
          ta.value =
            val.substring(0, s) +
            "\n" +
            indent +
            extra +
            "\n" +
            indent +
            val.substring(s);
          ta.selectionStart = ta.selectionEnd =
            s + 1 + indent.length + extra.length;
          triggerLiveUpdate();
          return;
        }
      }

      ta.value =
        val.substring(0, s) + "\n" + indent + extra + val.substring(end);
      ta.selectionStart = ta.selectionEnd =
        s + 1 + indent.length + extra.length;
      triggerLiveUpdate();
      return;
    }

    // Auto-dedent on } ) ]
    if ("})".includes(e.key) || e.key === "]") {
      const lineStart = val.lastIndexOf("\n", s - 1) + 1;
      const before = val.substring(lineStart, s);
      if (before.match(/^\s+$/) && before.length >= 2) {
        ta.value =
          val.substring(0, lineStart) + before.substring(2) + val.substring(s);
        ta.selectionStart = ta.selectionEnd = s - 2;
        // Let the character be typed naturally after dedent
      }
    }
  });

  // === Live update on input ===
  let liveTimer = null;
  function triggerLiveUpdate() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(liveUpdate, 250);
  }
  codeInput.addEventListener("input", triggerLiveUpdate);
  langSelect.addEventListener("change", triggerLiveUpdate);

  function liveUpdate() {
    clearTimeout(liveTimer);
    const newCode = normalizeCode(codeInput.value);
    if (!newCode) return;
    currentLang = langSelect.value;
    if (newCode !== currentCode) {
      if (currentCode) shiftAnnotations(currentCode, newCode);
      else annotations = [];
      currentCode = newCode;
    }
    renderAll();
    downloadBtn.disabled = false;
  }

  // Keep annotations outside the edited span; shift those after it, drop overlaps
  function shiftAnnotations(oldCode, newCode) {
    const d = diffRange(oldCode, newCode);
    const delta = newCode.length - oldCode.length;
    const lineOf = (s, i) => s.slice(0, i).split("\n").length;
    const editLine = lineOf(oldCode, d.start);
    annotations = annotations.filter((a) => {
      if (a.endOffset <= d.start) return true;
      if (a.startOffset < d.oldEnd) return false;
      const oldLine = lineOf(oldCode, a.startOffset);
      a.startOffset += delta;
      a.endOffset += delta;
      if (oldLine !== lineOf(newCode, a.startOffset) || oldLine === editLine) a.customCodePt = null;
      return true;
    });
  }

  const hintBadge = document.createElement("div");
  hintBadge.className = "selection-hint";
  hintBadge.textContent = "Drag to select code, then annotate";
  codeWrapper.appendChild(hintBadge);

  const SAMPLE_CODE = `function greet(name) {\n  const message = \`Hello, \${name}!\`;\n  console.log(message);\n  return message;\n}\n\nconst result = greet("World");`;

  // === Apply Code ===
  function applyCode() {
    liveUpdate();
  }

  // === Render code (pure Prism) ===
  function renderCode() {
    if (!currentCode) {
      codeContent.textContent = "";
      return;
    }
    codeContent.className = `language-${currentLang}`;
    codeDisplay.className = `language-${currentLang}`;
    codeContent.textContent = currentCode;
    Prism.highlightElement(codeContent);
  }

  function charOffsetToRange(container, sOff, eOff) {
    const range = document.createRange();
    const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let c = 0,
      ss = false;
    while (w.nextNode()) {
      const n = w.currentNode,
        l = n.textContent.length;
      if (!ss && c + l > sOff) {
        range.setStart(n, sOff - c);
        ss = true;
      }
      if (c + l >= eOff) {
        range.setEnd(n, eOff - c);
        break;
      }
      c += l;
    }
    return range;
  }

  function getUnionRect(range, rel) {
    const rects = range.getClientRects();
    if (!rects.length) return null;
    let t = Infinity,
      l = Infinity,
      b = -Infinity,
      r = -Infinity;
    for (const rc of rects) {
      t = Math.min(t, rc.top);
      l = Math.min(l, rc.left);
      b = Math.max(b, rc.bottom);
      r = Math.max(r, rc.right);
    }
    const ref = rel.getBoundingClientRect();
    return { x: l - ref.left, y: t - ref.top, w: r - l, h: b - t };
  }

  // === Text Selection ===
  let selRaf = null;
  document.addEventListener("selectionchange", () => {
    if (selRaf) cancelAnimationFrame(selRaf);
    selRaf = requestAnimationFrame(checkSel);
  });
  document.addEventListener("mousedown", (e) => {
    if (!selectionPopover.contains(e.target) && !codeContent.contains(e.target))
      hidePopover();
  });

  function checkSel() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const a = sel.anchorNode,
      f = sel.focusNode;
    if (!a || !f || (!codeContent.contains(a) && !codeContent.contains(f)))
      return;
    if (sel.isCollapsed || !sel.toString().trim()) {
      hidePopover();
      return;
    }
    const off = getSelOffsets(sel, codeContent);
    if (!off) {
      hidePopover();
      return;
    }
    pendingSelection = {
      text: sel.toString(),
      startOffset: off.start,
      endOffset: off.end,
    };
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const bw = 130;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    selectionPopover.style.display = "block";
    selectionPopover.style.left = left + "px";
    selectionPopover.style.top = rect.bottom + 10 + "px";
  }

  function getSelOffsets(sel, cont) {
    const range = sel.getRangeAt(0);
    const w = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, null);
    let c = 0,
      s = -1,
      e = -1;
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n === range.startContainer) s = c + range.startOffset;
      if (n === range.endContainer) {
        e = c + range.endOffset;
        break;
      }
      c += n.textContent.length;
    }
    return s >= 0 && e > s ? { start: s, end: e } : null;
  }

  function hidePopover() {
    selectionPopover.style.display = "none";
    pendingSelection = null;
  }

  // === Add / Delete / Color ===
  function addAnnotation() {
    if (!pendingSelection) return;
    annotations.push({
      id: nextId++,
      text: pendingSelection.text,
      startOffset: pendingSelection.startOffset,
      endOffset: pendingSelection.endOffset,
      description: "",
      color: "#1a1a1a",
      textColor: "#1a1a1a",
      fontSize: 14,
      customCodePt: null,
      customCardPt: null,
      cardPos: null,
      cardWidth: null,
      zIndex: ++topZ,
    });
    hidePopover();
    window.getSelection().removeAllRanges();
    renderAll();
    setTimeout(() => {
      const ed = document.querySelector(
        `.annotation-item[data-id="${annotations[annotations.length - 1].id}"] .editable-area`,
      );
      if (ed) ed.focus();
    }, 80);
  }

  function deleteAnnotation(id) {
    annotations = annotations.filter((a) => a.id !== id);
    renderAll();
  }

  function setColor(id, color) {
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    ann.color = color;
    renderAnnotationsList();
    renderAnnotationCards();
    layoutCards();
    raf2(drawOverlays);
  }
  function setTextColor(id, color) {
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    ann.textColor = color;
    renderAnnotationsList();
    renderAnnotationCards();
    layoutCards();
    raf2(drawOverlays);
  }
  function setFontSize(id, size) {
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    ann.fontSize = size;
    renderAnnotationsList();
    renderAnnotationCards();
    layoutCards();
    raf2(drawOverlays);
  }

  // === Render All ===
  function renderAll() {
    renderCode();
    renderAnnotationsList();
    renderAnnotationCards();
    const countEl = document.getElementById("ann-count");
    if (countEl) countEl.textContent = annotations.length;
    requestAnimationFrame(() => {
      layoutCards();
      raf2(drawOverlays);
    });
    saveState();
  }

  function raf2(fn) {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  }

  // === Sidebar List ===
  function renderAnnotationsList() {
    if (!annotations.length) {
      annotationsContainer.innerHTML =
        '<p style="color:var(--text-muted);font-size:13px;">No annotations yet.</p>';
      return;
    }
    annotationsContainer.innerHTML = annotations
      .map(
        (ann) => `
      <div class="annotation-item" data-id="${ann.id}" style="border-left-color:${ann.color};">
        <button class="delete-btn" onclick="window._del(${ann.id})" title="Delete">&times;</button>
        <div class="selected-text-preview">
          <span class="annotation-color-dot" style="background:${ann.color};"></span>
          <span>${esc(trunc(ann.text, 40))}</span>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">Highlight</span>
          <div class="color-picker">${COLORS.map((c) => `<span class="color-swatch${c === ann.color ? " active" : ""}" style="background:${c}" onclick="window._color(${ann.id},'${c}')"></span>`).join("")}</div>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">Text</span>
          <div class="color-picker">${TEXT_COLORS.map((c) => `<span class="color-swatch${c === ann.textColor ? " active" : ""}" style="background:${c}" onclick="window._txtColor(${ann.id},'${c}')"></span>`).join("")}</div>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label">Size</span>
          <div class="size-picker">${FONT_SIZES.map((s) => `<button class="size-btn${s === ann.fontSize ? " active" : ""}" onclick="window._fontSize(${ann.id},${s})">${s}</button>`).join("")}</div>
        </div>
        <div class="fmt-toolbar">
          <button class="fmt-btn" onmousedown="event.preventDefault();window._fmt('bold')" title="Bold"><b>B</b></button>
          <button class="fmt-btn" onmousedown="event.preventDefault();window._fmt('italic')" title="Italic"><i>I</i></button>
          <button class="fmt-btn" onmousedown="event.preventDefault();window._fmt('underline')" title="Underline"><u>U</u></button>
          <button class="fmt-btn" onmousedown="event.preventDefault();window._fmt('strikeThrough')" title="Strikethrough"><s>S</s></button>
          <span class="fmt-sep"></span>
          <button class="fmt-btn" onmousedown="event.preventDefault();window._fmt('insertUnorderedList')" title="Bullet list">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
          </button>
          <button class="fmt-btn" onmousedown="event.preventDefault();window._fmt('insertOrderedList')" title="Numbered list">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><text x="2" y="8" font-size="8" fill="currentColor" stroke="none" font-weight="700">1</text><text x="2" y="14" font-size="8" fill="currentColor" stroke="none" font-weight="700">2</text><text x="2" y="20" font-size="8" fill="currentColor" stroke="none" font-weight="700">3</text></svg>
          </button>
        </div>
        <div class="editable-area" contenteditable="true" data-ann-id="${ann.id}"
             oninput="window._descHtml(${ann.id}, this)"
             data-placeholder="Describe what this code does...">${ann.description}</div>
      </div>`,
      )
      .join("");
  }

  // === Cards (absolute positioned) ===
  function renderAnnotationCards() {
    if (!annotations.length) {
      annotationCards.innerHTML = "";
      return;
    }
    annotationCards.innerHTML = annotations
      .map(
        (ann) => `
      <div class="annotation-card" data-id="${ann.id}" id="card-${ann.id}" style="z-index:${ann.zIndex || 1};">
        <div class="card-body">
          <div class="card-code">${esc(ann.text)}</div>
          <div class="card-text" style="font-size:${ann.fontSize}px;color:${ann.textColor};">${ann.description}</div>
        </div>
        <div class="card-resize-grip"></div>
      </div>`,
      )
      .join("");
  }

  function layoutCards() {
    const eRect = exportArea.getBoundingClientRect();
    const wRect = codeWrapper.getBoundingClientRect();
    const startY = wRect.bottom - eRect.top + 50;
    const maxW = Math.min(exportArea.clientWidth - 64, 500);
    let nextY = startY;

    for (const ann of annotations) {
      const el = document.getElementById(`card-${ann.id}`);
      if (!el) continue;
      if (!ann.cardPos) ann.cardPos = { x: 32, y: nextY };
      el.style.left = ann.cardPos.x + "px";
      el.style.top = ann.cardPos.y + "px";
      if (ann.cardWidth) {
        el.style.width = ann.cardWidth + "px";
      } else {
        el.style.maxWidth = maxW + "px";
      }
      el.style.zIndex = ann.zIndex || 1;
      nextY = ann.cardPos.y + el.offsetHeight + 12;
    }
    updateExportHeight();
  }

  function updateExportHeight() {
    let maxB = 0;
    for (const ann of annotations) {
      const el = document.getElementById(`card-${ann.id}`);
      if (el && ann.cardPos)
        maxB = Math.max(maxB, ann.cardPos.y + el.offsetHeight);
    }
    exportArea.style.minHeight = maxB + 60 + "px";
  }

  // ============================================================
  // Draw overlays: highlight boxes + arrows (card → code)
  // ============================================================
  function drawOverlays() {
    const ctx = arrowsCanvas.getContext("2d");
    drawnArrows = [];
    if (!annotations.length) {
      arrowsCanvas.width = 0;
      arrowsCanvas.height = 0;
      arrowsCanvas.style.height = "0";
      return;
    }

    const eRect = exportArea.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cW = exportArea.scrollWidth,
      cH = exportArea.scrollHeight;
    arrowsCanvas.style.width = cW + "px";
    arrowsCanvas.style.height = cH + "px";
    arrowsCanvas.width = cW * dpr;
    arrowsCanvas.height = cH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cW, cH);

    const pad = 5;
    for (const ann of annotations) {
      const range = charOffsetToRange(
        codeContent,
        ann.startOffset,
        ann.endOffset,
      );
      const box = getUnionRect(range, exportArea);
      const cardEl = document.getElementById(`card-${ann.id}`);
      if (!box || !cardEl) continue;

      // Highlight box
      const rx = box.x - pad,
        ry = box.y - pad,
        rw = box.w + pad * 2,
        rh = box.h + pad * 2;
      ctx.save();
      ctx.fillStyle = ann.color;
      ctx.globalAlpha = 0.08;
      roundRect(ctx, rx, ry, rw, rh, 5);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      roundRect(ctx, rx, ry, rw, rh, 5);
      ctx.stroke();
      ctx.restore();

      // Arrow endpoints — snap to nearest edge midpoints
      const codeCx = box.x + box.w / 2,
        codeCy = box.y + box.h / 2;
      const cardR = cardEl.getBoundingClientRect();
      const cl = cardR.left - eRect.left,
        ct = cardR.top - eRect.top;
      const cw = cardR.width,
        ch = cardR.height;
      const cardCx = cl + cw / 2,
        cardCy = ct + ch / 2;

      // Code-side: snap highlight edge nearest to card center
      const codeEdges = [
        { x: codeCx, y: box.y - pad - 2 },
        { x: codeCx, y: box.y + box.h + pad + 2 },
        { x: box.x - pad - 2, y: codeCy },
        { x: box.x + box.w + pad + 2, y: codeCy },
      ];
      const defCode = codeEdges.reduce(
        (best, pt) => {
          const d = (pt.x - cardCx) ** 2 + (pt.y - cardCy) ** 2;
          return d < best.d ? { ...pt, d } : best;
        },
        { ...codeEdges[0], d: Infinity },
      );

      // Card-side: snap card edge nearest to code center
      const cardEdges = [
        { x: cardCx, y: ct },
        { x: cardCx, y: ct + ch },
        { x: cl, y: cardCy },
        { x: cl + cw, y: cardCy },
      ];
      const defCard = cardEdges.reduce(
        (best, pt) => {
          const d = (pt.x - codeCx) ** 2 + (pt.y - codeCy) ** 2;
          return d < best.d ? { ...pt, d } : best;
        },
        { ...cardEdges[0], d: Infinity },
      );

      const codePt = ann.customCodePt || { x: defCode.x, y: defCode.y };
      const cardPt = ann.customCardPt || { x: defCard.x, y: defCard.y };
      drawnArrows.push({ annId: ann.id, codePt, cardPt, color: ann.color });

      // Bezier from card to code
      const x1 = cardPt.x,
        y1 = cardPt.y,
        x2 = codePt.x,
        y2 = codePt.y;
      const cp1x = x1 + (x2 - x1) * 0.1,
        cp1y = y1 + (y2 - y1) * 0.45;
      const cp2x = x2 - (x2 - x1) * 0.1,
        cp2y = y2 - (y2 - y1) * 0.45;

      ctx.save();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      ctx.stroke();
      ctx.restore();

      // Start dot (card)
      ctx.save();
      ctx.fillStyle = ann.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Arrowhead at code — tangent = P3 - P2
      const tx = x2 - cp2x,
        ty = y2 - cp2y;
      const angle = Math.atan2(ty, tx);
      drawArrowhead(ctx, x2, y2, angle, 9, ann.color);
    }
    if (arrowDrag) drawHandles(ctx);
  }

  function drawArrowhead(ctx, x, y, angle, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.55);
    ctx.lineTo(-size, size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHandles(ctx) {
    for (const a of drawnArrows) {
      ctx.save();
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(a.codePt.x, a.codePt.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a.cardPt.x, a.cardPt.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ============================================================
  // Drag: arrows, cards, code box, export area
  // ============================================================
  let arrowDrag = null; // { annId, which:'code'|'card' }
  let cardDrag = null; // { annId, offX, offY }
  let cardResize = null; // { annId, startW, startH, startX, startY }
  let codeResize = null; // { startW, startH, startX, startY }
  let exportResize = null; // { edge:'r'|'b'|'br', startW, startH, startX, startY }
  const HR = 12;

  // Custom sizes (null = auto)
  let codeBoxSize = { w: null, h: null };
  let exportCustomSize = { w: null, h: null };

  function arrowHit(cx, cy) {
    const eR = exportArea.getBoundingClientRect();
    const mx = cx - eR.left,
      my = cy - eR.top;
    for (const a of drawnArrows) {
      if (dist(mx, my, a.codePt.x, a.codePt.y) < HR)
        return { annId: a.annId, which: "code" };
      if (dist(mx, my, a.cardPt.x, a.cardPt.y) < HR)
        return { annId: a.annId, which: "card" };
    }
    return null;
  }
  function dist(a, b, c, d) {
    return Math.sqrt((a - c) ** 2 + (b - d) ** 2);
  }

  function applyCodeBoxSize() {
    if (codeBoxSize.w) codeWrapper.style.width = codeBoxSize.w + "px";
    else codeWrapper.style.width = "";
    if (codeBoxSize.h) {
      codeWrapper.style.height = codeBoxSize.h + "px";
      codeDisplay.style.height = "100%";
      codeDisplay.style.overflowY = "auto";
    } else {
      codeWrapper.style.height = "";
      codeDisplay.style.height = "";
      codeDisplay.style.overflowY = "";
    }
  }

  function applyExportSize() {
    if (exportCustomSize.w) exportArea.style.width = exportCustomSize.w + "px";
    else exportArea.style.width = "";
    if (exportCustomSize.h) {
      exportArea.style.minHeight = exportCustomSize.h + "px";
      exportArea.style.height = exportCustomSize.h + "px";
    }
    // don't clear min-height here, updateExportHeight handles it
  }

  // --- Unified mousemove ---
  document.addEventListener("mousemove", (e) => {
    // Arrow drag
    if (arrowDrag) {
      const ann = annotations.find((a) => a.id === arrowDrag.annId);
      if (!ann) return;
      const eR = exportArea.getBoundingClientRect();
      const pt = { x: e.clientX - eR.left, y: e.clientY - eR.top };
      if (arrowDrag.which === "code") ann.customCodePt = pt;
      else ann.customCardPt = pt;
      drawOverlays();
      return;
    }
    // Card drag
    if (cardDrag) {
      const ann = annotations.find((a) => a.id === cardDrag.annId);
      if (!ann) return;
      const eR = exportArea.getBoundingClientRect();
      ann.cardPos = {
        x: e.clientX - eR.left - cardDrag.offX,
        y: e.clientY - eR.top - cardDrag.offY,
      };
      const el = document.getElementById(`card-${ann.id}`);
      if (el) {
        el.style.left = ann.cardPos.x + "px";
        el.style.top = ann.cardPos.y + "px";
      }
      drawOverlays();
      updateExportHeight();
      return;
    }
    // Card resize (2D)
    if (cardResize) {
      const ann = annotations.find((a) => a.id === cardResize.annId);
      if (!ann) return;
      const el = document.getElementById(`card-${ann.id}`);
      if (!el) return;
      ann.cardWidth = Math.max(
        140,
        cardResize.startW + (e.clientX - cardResize.startX),
      );
      el.style.width = ann.cardWidth + "px";
      const newH = Math.max(
        60,
        cardResize.startH + (e.clientY - cardResize.startY),
      );
      el.style.height = newH + "px";
      el.style.overflow = "hidden";
      drawOverlays();
      updateExportHeight();
      return;
    }
    // Code box resize
    if (codeResize) {
      codeBoxSize.w = Math.max(
        200,
        codeResize.startW + (e.clientX - codeResize.startX),
      );
      codeBoxSize.h = Math.max(
        60,
        codeResize.startH + (e.clientY - codeResize.startY),
      );
      applyCodeBoxSize();
      drawOverlays();
      return;
    }
    // Export area resize
    if (exportResize) {
      exportArea.classList.add("resizing");
      const edge = exportResize.edge;
      if (edge === "r" || edge === "br")
        exportCustomSize.w = Math.max(
          300,
          exportResize.startW + (e.clientX - exportResize.startX),
        );
      if (edge === "b" || edge === "br")
        exportCustomSize.h = Math.max(
          200,
          exportResize.startH + (e.clientY - exportResize.startY),
        );
      applyExportSize();
      drawOverlays();
      return;
    }

    // Hover: arrow endpoints
    const hit = arrowHit(e.clientX, e.clientY);
    arrowsCanvas.style.pointerEvents = hit ? "auto" : "none";
    arrowsCanvas.style.cursor = hit ? "grab" : "";
  });

  // --- Arrow mousedown ---
  arrowsCanvas.addEventListener("mousedown", (e) => {
    const hit = arrowHit(e.clientX, e.clientY);
    if (hit) {
      arrowDrag = hit;
      arrowsCanvas.style.cursor = "grabbing";
      e.preventDefault();
      e.stopPropagation();
      drawOverlays();
    }
  });
  arrowsCanvas.addEventListener("dblclick", (e) => {
    const hit = arrowHit(e.clientX, e.clientY);
    if (hit) {
      const ann = annotations.find((a) => a.id === hit.annId);
      if (ann) {
        if (hit.which === "code") ann.customCodePt = null;
        else ann.customCardPt = null;
        drawOverlays();
      }
    }
  });

  // --- Export area resize handles ---
  exportArea
    .querySelector(".export-handle-r")
    .addEventListener("mousedown", (e) => {
      exportResize = {
        edge: "r",
        startW: exportArea.offsetWidth,
        startH: exportArea.offsetHeight,
        startX: e.clientX,
        startY: e.clientY,
      };
      e.preventDefault();
    });
  exportArea
    .querySelector(".export-handle-b")
    .addEventListener("mousedown", (e) => {
      exportResize = {
        edge: "b",
        startW: exportArea.offsetWidth,
        startH: exportArea.offsetHeight,
        startX: e.clientX,
        startY: e.clientY,
      };
      e.preventDefault();
    });
  exportArea
    .querySelector(".export-handle-br")
    .addEventListener("mousedown", (e) => {
      exportResize = {
        edge: "br",
        startW: exportArea.offsetWidth,
        startH: exportArea.offsetHeight,
        startX: e.clientX,
        startY: e.clientY,
      };
      e.preventDefault();
    });

  // --- Code box resize ---
  codeWrapper
    .querySelector(".code-resize-grip")
    .addEventListener("mousedown", (e) => {
      codeResize = {
        startW: codeWrapper.offsetWidth,
        startH: codeWrapper.offsetHeight,
        startX: e.clientX,
        startY: e.clientY,
      };
      e.preventDefault();
      e.stopPropagation();
    });

  // --- Card drag & resize (delegation) ---
  exportArea.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
    if (e.target.closest(".export-handle")) return; // handled above

    const card = e.target.closest(".annotation-card");
    if (!card) return;
    const annId = parseInt(card.dataset.id);
    const ann = annotations.find((a) => a.id === annId);
    if (!ann) return;
    const eR = exportArea.getBoundingClientRect();

    ann.zIndex = ++topZ;
    card.style.zIndex = ann.zIndex;

    if (e.target.closest(".card-resize-grip")) {
      cardResize = {
        annId,
        startW: card.offsetWidth,
        startH: card.offsetHeight,
        startX: e.clientX,
        startY: e.clientY,
      };
      e.preventDefault();
      return;
    }
    cardDrag = {
      annId,
      offX: e.clientX - eR.left - (ann.cardPos ? ann.cardPos.x : 0),
      offY: e.clientY - eR.top - (ann.cardPos ? ann.cardPos.y : 0),
    };
    e.preventDefault();
  });

  // --- Unified mouseup ---
  document.addEventListener("mouseup", () => {
    if (arrowDrag) {
      arrowDrag = null;
      arrowsCanvas.style.cursor = "";
      arrowsCanvas.style.pointerEvents = "none";
      drawOverlays();
    }
    if (cardDrag) cardDrag = null;
    if (cardResize) cardResize = null;
    if (codeResize) codeResize = null;
    if (exportResize) {
      exportArea.classList.remove("resizing");
      exportResize = null;
    }
  });

  // Dblclick on code resize grip to reset
  codeWrapper
    .querySelector(".code-resize-grip")
    .addEventListener("dblclick", (e) => {
      codeBoxSize = { w: null, h: null };
      applyCodeBoxSize();
      drawOverlays();
      e.stopPropagation();
    });

  // Dblclick on export handle to reset
  exportArea
    .querySelector(".export-handle-br")
    .addEventListener("dblclick", (e) => {
      exportCustomSize = { w: null, h: null };
      exportArea.style.width = "";
      exportArea.style.height = "";
      updateExportHeight();
      drawOverlays();
      e.stopPropagation();
    });

  previewScroll.addEventListener("scroll", () =>
    requestAnimationFrame(drawOverlays),
  );
  window.addEventListener("resize", () => {
    annotations.forEach((a) => {
      a.customCodePt = null;
      a.customCardPt = null;
      a.cardPos = null;
      a.cardWidth = null;
    });
    codeBoxSize = { w: null, h: null };
    exportCustomSize = { w: null, h: null };
    applyCodeBoxSize();
    exportArea.style.width = "";
    exportArea.style.height = "";
    renderAll();
  });

  // ============================================================
  // PNG Export — with preview modal
  // ============================================================
  const modal = document.getElementById("preview-modal");
  const modalImg = document.getElementById("modal-preview-img");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalDownloadBtn = document.getElementById("modal-download-btn");
  let pendingDataUrl = null;

  function closeModal() {
    modal.style.display = "none";
    pendingDataUrl = null;
  }
  modalCloseBtn.addEventListener("click", closeModal);
  modalCancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modal.style.display !== "none") closeModal();
      if (howtoModal.style.display !== "none")
        howtoModal.style.display = "none";
    }
  });
  modalDownloadBtn.addEventListener("click", () => {
    if (!pendingDataUrl) return;
    const link = document.createElement("a");
    link.download = "code-annotation.png";
    link.href = pendingDataUrl;
    link.click();
    closeModal();
  });

  // Calculate the true bounding box of all export content
  function getExportBounds() {
    const eRect = exportArea.getBoundingClientRect();
    let maxRight = exportArea.clientWidth;
    let maxBottom = 0;

    // Code wrapper bounds
    const wRect = codeWrapper.getBoundingClientRect();
    maxBottom = Math.max(maxBottom, wRect.bottom - eRect.top);
    maxRight = Math.max(maxRight, wRect.right - eRect.left);

    // All card bounds
    for (const ann of annotations) {
      const el = document.getElementById(`card-${ann.id}`);
      if (!el) continue;
      const cr = el.getBoundingClientRect();
      maxBottom = Math.max(maxBottom, cr.bottom - eRect.top);
      maxRight = Math.max(maxRight, cr.right - eRect.left);
    }

    return { w: maxRight, h: maxBottom };
  }

  async function downloadPNG() {
    if (!currentCode) return;
    const origBtnHtml = downloadBtn.innerHTML;
    downloadBtn.textContent = "Generating...";
    downloadBtn.disabled = true;

    try {
      const theme = htmlEl.getAttribute("data-theme");
      const C =
        theme === "dark"
          ? {
              bg: "#09090c",
              border: "#26262e",
              codeBg: "#0e0e13",
              cardBg: "#141418",
              ter: "#1b1b21",
              text: "#eae8e4",
            }
          : {
              bg: "#f4f1ec",
              border: "#ddd9d2",
              codeBg: "#f9f7f4",
              cardBg: "#ffffff",
              ter: "#edeae4",
              text: "#1a1918",
            };

      // Ensure overlays are current
      drawOverlays();
      await sleep(50);

      // Measure everything from live DOM without changing it
      const codeW = codeWrapper.offsetWidth;
      const codeH = codeWrapper.offsetHeight;
      const bounds = getExportBounds();
      const pad = 32; // keep same as CSS padding
      const totalW =
        exportCustomSize.w || Math.max(bounds.w + pad, exportArea.offsetWidth);
      const totalH =
        exportCustomSize.h || Math.max(bounds.h + pad, exportArea.offsetHeight);

      // --- Pass 1: capture code block as-is (no DOM changes) ---
      const codeCanvas = await html2canvas(codeWrapper, {
        backgroundColor: C.codeBg,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const codeDataUrl = codeCanvas.toDataURL("image/png");

      // --- Pass 2: capture full area — all changes in onclone only ---
      const fullCanvas = await html2canvas(exportArea, {
        backgroundColor: C.bg,
        scale: 2,
        useCORS: true,
        logging: false,
        width: totalW,
        height: totalH,
        windowWidth: totalW + 40,
        windowHeight: totalH + 40,
        onclone: (doc) => {
          const ce = doc.getElementById("export-area");
          if (!ce) return;
          ce.style.background = C.bg;
          ce.style.width = totalW + "px";
          ce.style.height = totalH + "px";
          ce.style.minHeight = totalH + "px";
          ce.style.overflow = "visible";
          ce.style.border = "none";

          // Replace code wrapper with captured image in the clone
          const cloneWrapper = doc.getElementById("code-display-wrapper");
          if (cloneWrapper) {
            const img = doc.createElement("img");
            img.src = codeDataUrl;
            img.style.width = codeW + "px";
            img.style.height = codeH + "px";
            img.style.display = "block";
            img.style.borderRadius = "10px";
            cloneWrapper.parentNode.insertBefore(img, cloneWrapper);
            cloneWrapper.style.display = "none";
          }

          // Clean up UI elements from clone
          doc
            .querySelectorAll(
              ".selection-hint, .card-resize-grip, .code-resize-grip, .export-handle",
            )
            .forEach((e) => e.remove());

          // Inline card styles for html2canvas
          doc.querySelectorAll(".annotation-card").forEach((c) => {
            c.style.background = C.cardBg;
            c.style.border = `1px solid ${C.border}`;
            c.style.borderRadius = "10px";
            c.style.overflow = "hidden";
            c.style.backdropFilter = "none";
            c.style.webkitBackdropFilter = "none";
          });
          const codeVisible = showCodeToggle.checked;
          doc.querySelectorAll(".card-body").forEach((b) => {
            b.style.padding = "14px 16px";
            b.style.pointerEvents = "auto";
            b.style.display = "flex";
            b.style.flexDirection = "column";
            if (!codeVisible) b.style.justifyContent = "center";
          });
          doc.querySelectorAll(".card-code").forEach((c) => {
            c.style.background = C.ter;
            c.style.fontFamily =
              "'JetBrains Mono','SF Mono',Consolas,monospace";
            c.style.fontSize = "12px";
            c.style.padding = "10px 14px";
            c.style.borderRadius = "6px";
            c.style.whiteSpace = "pre-wrap";
          });
          doc.querySelectorAll(".card-text").forEach((t) => {
            if (!t.style.color) t.style.color = C.text;
            if (!t.style.fontSize) t.style.fontSize = "14px";
            t.style.lineHeight = "1.65";
            if (codeVisible) t.style.marginTop = "10px";
            t.style.fontFamily = "'Bricolage Grotesque',system-ui,sans-serif";
          });
        },
      });

      // Show preview modal — no DOM restoration needed
      pendingDataUrl = fullCanvas.toDataURL("image/png");
      modalImg.src = pendingDataUrl;
      modal.style.display = "flex";
    } catch (err) {
      console.error("PNG export failed:", err);
    } finally {
      downloadBtn.innerHTML = origBtnHtml;
      downloadBtn.disabled = false;
    }
  }

  // === Helpers ===
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
  function trunc(s, n) {
    return s.length > n ? s.substring(0, n) + "..." : s;
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Trim surrounding blank lines and the indent common to all non-blank lines
  function normalizeCode(raw) {
    const lines = raw.replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let pre = null;
    for (const l of lines) {
      if (!l.trim()) continue;
      const ind = l.match(/^[ \t]*/)[0];
      if (pre === null) pre = ind;
      else { let i = 0; while (i < pre.length && pre[i] === ind[i]) i++; pre = pre.slice(0, i); }
    }
    if (!pre) return lines.join("\n");
    return lines.map((l) => (l.startsWith(pre) ? l.slice(pre.length) : l.trimStart())).join("\n");
  }
  function diffRange(a, b) {
    const max = Math.min(a.length, b.length);
    let p = 0;
    while (p < max && a[p] === b[p]) p++;
    let s = 0;
    while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    return { start: p, oldEnd: a.length - s, newEnd: b.length - s };
  }

  // === Persistence ===
  const STATE_KEY = "code-annotator-state";
  let saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeState, 300);
  }
  function writeState() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ code: codeInput.value, lang: langSelect.value, annotations, nextId, topZ }));
    } catch (e) {}
  }
  function restoreState() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(STATE_KEY)); } catch (e) {}
    try {
      if (!st || typeof st.code !== "string" || !st.code.trim() || !Array.isArray(st.annotations)) throw 0;
      const code = normalizeCode(st.code);
      const anns = st.annotations.filter((a) => a && typeof a === "object" && Number.isInteger(a.id) &&
        Number.isInteger(a.startOffset) && Number.isInteger(a.endOffset) &&
        a.startOffset >= 0 && a.endOffset > a.startOffset && a.endOffset <= code.length);
      codeInput.value = st.code;
      if ([...langSelect.options].some((o) => o.value === st.lang)) langSelect.value = st.lang;
      currentLang = langSelect.value;
      currentCode = code;
      annotations = anns;
      nextId = Math.max(Number(st.nextId) || 1, ...anns.map((a) => a.id + 1));
      topZ = Math.max(Number(st.topZ) || 1, ...anns.map((a) => Number(a.zIndex) || 0));
    } catch (e) {
      codeInput.value = SAMPLE_CODE;
      annotations = [];
      currentCode = "";
    }
  }
  window.addEventListener("pagehide", writeState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writeState();
  });

  window._del = deleteAnnotation;
  window._color = setColor;
  window._txtColor = setTextColor;
  window._fontSize = setFontSize;
  window._fmt = function (cmd, val) {
    document.execCommand(cmd, false, val || null);
  };
  window._descHtml = function (id, el) {
    const ann = annotations.find((a) => a.id === id);
    if (ann) {
      ann.description = el.innerHTML;
      saveState();
      renderAnnotationCards();
      layoutCards();
      raf2(drawOverlays);
    }
  };

  initTheme();
  restoreState();
  applyCode();
})();
