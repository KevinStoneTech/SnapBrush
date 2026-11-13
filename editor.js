const { ipcRenderer } = require('electron');

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Camada independente exclusiva para anotações
const drawCanvas = document.createElement('canvas');
const drawCtx = drawCanvas.getContext('2d');

const drawToolbar = document.getElementById('drawToolbar');
const textInput = document.getElementById('textInput');
const sizeSlider = document.getElementById('strokeSize');
const sizeCircle = document.getElementById('sizeCircle');

const arrowBtn = document.getElementById('arrowBtn');
const arrowMenu = document.getElementById('arrowMenu');
const arrowIconSlot = document.getElementById('arrowIconSlot');

const rectBtn = document.getElementById('rectBtn');
const rectMenu = document.getElementById('rectMenu');
const rectIconSlot = document.getElementById('rectIconSlot');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
drawCanvas.width = window.innerWidth;
drawCanvas.height = window.innerHeight;

let bgImage = new Image();
let selection = null;
let isSelecting = false;
let resizingHandle = null;
let isDrawing = false;

let currentTool = 'pen';
let currentArrowVariant = 'arrow-simple';
let currentRectVariant = 'rect-outline';
let currentColor = '#ff2e2e';
let currentSize = 5;

let actions = [];
let currentAction = null;
let activeTextPos = null;

// Controle para mover qualquer texto a qualquer momento
let draggingTextAction = null;
let hoveredTextAction = null;
let textDragOffset = { x: 0, y: 0 };

function updateSizeIndicator() {
  sizeSlider.value = currentSize;
  const visualDiameter = Math.max(4, Math.min(20, currentSize));
  sizeCircle.style.width = `${visualDiameter}px`;
  sizeCircle.style.height = `${visualDiameter}px`;
  sizeCircle.style.background = currentTool === 'eraser' ? '#ffffff' : currentColor;
}
updateSizeIndicator();

function closeAllSubmenus() {
  arrowMenu.classList.remove('show');
  rectMenu.classList.remove('show');
}

function adjustSubmenuDirection(menuEl) {
  const rect = drawToolbar.getBoundingClientRect();
  if (rect.top < 210) {
    menuEl.classList.add('open-down');
  } else {
    menuEl.classList.remove('open-down');
  }
}

function toggleSubmenu(menuEl) {
  const isShowing = menuEl.classList.contains('show');
  closeAllSubmenus();
  if (!isShowing) {
    adjustSubmenuDirection(menuEl);
    menuEl.classList.add('show');
  }
}

ipcRenderer.on('screen-captured', (event, dataUrl) => {
  selection = null;
  isSelecting = false;
  resizingHandle = null;
  isDrawing = false;
  actions = [];
  currentAction = null;
  activeTextPos = null;
  draggingTextAction = null;
  hoveredTextAction = null;
  closeAllSubmenus();
  drawToolbar.style.display = 'none';
  textInput.style.display = 'none';

  bgImage = new Image();
  bgImage.onload = () => render();
  bgImage.src = dataUrl;
});

function clearActiveStates() {
  document.querySelectorAll('#drawToolbar .icon-btn').forEach(b => b.classList.remove('active'));
}

document.querySelectorAll('#drawToolbar .icon-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    commitTextBox();
    closeAllSubmenus();
    clearActiveStates();
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
    updateSizeIndicator();
  });
});

// Botão Seta
arrowBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  commitTextBox();
  const clickedCaret = e.target.dataset && e.target.dataset.caret === 'arrow';
  const alreadyActive = currentTool.startsWith('arrow-');

  clearActiveStates();
  arrowBtn.classList.add('active');
  currentTool = currentArrowVariant;
  updateSizeIndicator();

  if (clickedCaret || alreadyActive) {
    toggleSubmenu(arrowMenu);
  } else {
    closeAllSubmenus();
  }
});

arrowBtn.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  commitTextBox();
  clearActiveStates();
  arrowBtn.classList.add('active');
  currentTool = currentArrowVariant;
  updateSizeIndicator();
  toggleSubmenu(arrowMenu);
});

arrowMenu.querySelectorAll('.submenu-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    arrowMenu.querySelectorAll('.submenu-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    currentArrowVariant = item.dataset.variant;
    currentTool = currentArrowVariant;
    arrowIconSlot.innerHTML = item.querySelector('svg').outerHTML;
    clearActiveStates();
    arrowBtn.classList.add('active');
    closeAllSubmenus();
  });
});

// Botão Formas (Retângulos e Círculos)
rectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  commitTextBox();
  const clickedCaret = e.target.dataset && e.target.dataset.caret === 'rect';
  const alreadyActive = currentTool.startsWith('rect-') || currentTool.startsWith('circle-');

  clearActiveStates();
  rectBtn.classList.add('active');
  currentTool = currentRectVariant;
  updateSizeIndicator();

  if (clickedCaret || alreadyActive) {
    toggleSubmenu(rectMenu);
  } else {
    closeAllSubmenus();
  }
});

rectBtn.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  commitTextBox();
  clearActiveStates();
  rectBtn.classList.add('active');
  currentTool = currentRectVariant;
  updateSizeIndicator();
  toggleSubmenu(rectMenu);
});

rectMenu.querySelectorAll('.submenu-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    rectMenu.querySelectorAll('.submenu-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    currentRectVariant = item.dataset.variant;
    currentTool = currentRectVariant;
    rectIconSlot.innerHTML = item.querySelector('svg').outerHTML;
    clearActiveStates();
    rectBtn.classList.add('active');
    closeAllSubmenus();
  });
});

document.querySelectorAll('.swatch').forEach(s => {
  s.addEventListener('click', () => {
    closeAllSubmenus();
    document.querySelectorAll('.swatch').forEach(el => el.classList.remove('selected'));
    s.classList.add('selected');
    currentColor = s.dataset.color;
    document.getElementById('colorPicker').value = currentColor;
    textInput.style.color = currentColor;
    updateSizeIndicator();
  });
});

document.getElementById('colorPicker').addEventListener('input', (e) => {
  closeAllSubmenus();
  document.querySelectorAll('.swatch').forEach(el => el.classList.remove('selected'));
  currentColor = e.target.value;
  textInput.style.color = currentColor;
  updateSizeIndicator();
});

sizeSlider.addEventListener('input', (e) => {
  currentSize = parseInt(e.target.value, 10);
  updateSizeIndicator();
});

window.addEventListener('wheel', (e) => {
  if (!selection) return;
  currentSize = Math.max(2, Math.min(22, currentSize + (e.deltaY < 0 ? 1 : -1)));
  updateSizeIndicator();
});

function getResizeHandles(sel) {
  const { x, y, w, h } = sel;
  const mx = x + w / 2;
  const my = y + h / 2;
  return [
    { id: 'nw', x: x,     y: y,     cursor: 'nwse-resize' },
    { id: 'n',  x: mx,    y: y,     cursor: 'ns-resize'   },
    { id: 'ne', x: x + w, y: y,     cursor: 'nesw-resize' },
    { id: 'e',  x: x + w, y: my,    cursor: 'ew-resize'   },
    { id: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
    { id: 's',  x: mx,    y: y + h, cursor: 'ns-resize'   },
    { id: 'sw', x: x,     y: y + h, cursor: 'nesw-resize' },
    { id: 'w',  x: x,     y: my,    cursor: 'ew-resize'   }
  ];
}

function findHandleAt(mx, my) {
  if (!selection) return null;
  const handles = getResizeHandles(selection);
  for (const h of handles) {
    if (Math.abs(mx - h.x) <= 6 && Math.abs(my - h.y) <= 6) {
      return h;
    }
  }
  return null;
}

// Calcula a caixa de seleção de qualquer texto já inserido para permitir arrastá-lo
function getTextBounds(act) {
  ctx.save();
  ctx.font = `bold ${act.size}px 'Segoe UI', sans-serif`;
  const width = ctx.measureText(act.text).width;
  ctx.restore();
  const height = act.size;
  const x = act.points[0].x;
  const y = act.points[0].y - height * 0.85;
  return { x: x - 5, y: y - 3, w: width + 10, h: height + 8 };
}

function findTextActionAt(mx, my) {
  for (let i = actions.length - 1; i >= 0; i--) {
    const act = actions[i];
    if (act.tool === 'text') {
      const b = getTextBounds(act);
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        return act;
      }
    }
  }
  return null;
}

function commitTextBox() {
  if (textInput.style.display !== 'block' || !activeTextPos) return;
  const val = textInput.value.trim();
  const { x, y, fontSize } = activeTextPos;
  textInput.style.display = 'none';
  textInput.value = '';
  activeTextPos = null;

  if (val !== '') {
    actions.push({
      tool: 'text',
      color: currentColor,
      size: fontSize,
      text: val,
      points: [{ x, y: y + fontSize / 2 }]
    });
    render();
  }
}

textInput.addEventListener('blur', () => {
  commitTextBox();
});

canvas.addEventListener('mousedown', (e) => {
  closeAllSubmenus();

  if (textInput.style.display === 'block') {
    commitTextBox();
    return;
  }

  if (!selection) {
    isSelecting = true;
    selection = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
    return;
  }

  const handle = findHandleAt(e.clientX, e.clientY);
  if (handle) {
    resizingHandle = handle.id;
    drawToolbar.style.display = 'none';
    return;
  }

  // Se clicar sobre qualquer texto já adicionado (e não estiver usando a borracha), inicia o movimento dele
  if (currentTool !== 'eraser') {
    const clickedText = findTextActionAt(e.clientX, e.clientY);
    if (clickedText) {
      draggingTextAction = clickedText;
      hoveredTextAction = clickedText;
      textDragOffset.x = e.clientX - clickedText.points[0].x;
      textDragOffset.y = e.clientY - clickedText.points[0].y;
      canvas.style.cursor = 'move';
      render();
      return;
    }
  }

  if (currentTool === 'text') {
    openTextBox(e.clientX, e.clientY);
    return;
  }

  isDrawing = true;
  currentAction = {
    tool: currentTool,
    color: currentColor,
    size: currentSize,
    points: [{ x: e.clientX, y: e.clientY }]
  };
});

canvas.addEventListener('mousemove', (e) => {
  if (isSelecting) {
    selection.w = e.clientX - selection.x;
    selection.h = e.clientY - selection.y;
    render();
    return;
  }

  if (resizingHandle && selection) {
    let x1 = selection.x;
    let y1 = selection.y;
    let x2 = selection.x + selection.w;
    let y2 = selection.y + selection.h;

    if (resizingHandle.includes('w')) x1 = e.clientX;
    if (resizingHandle.includes('e')) x2 = e.clientX;
    if (resizingHandle.includes('n')) y1 = e.clientY;
    if (resizingHandle.includes('s')) y2 = e.clientY;

    selection.x = x1;
    selection.y = y1;
    selection.w = x2 - x1;
    selection.h = y2 - y1;
    render();
    return;
  }

  // Move o texto selecionado em tempo real
  if (draggingTextAction) {
    draggingTextAction.points[0].x = e.clientX - textDragOffset.x;
    draggingTextAction.points[0].y = e.clientY - textDragOffset.y;
    render();
    return;
  }

  if (isDrawing && currentAction) {
    if (['pen', 'brush', 'highlighter', 'eraser'].includes(currentTool)) {
      currentAction.points.push({ x: e.clientX, y: e.clientY });
    } else {
      currentAction.points[1] = { x: e.clientX, y: e.clientY };
    }
    render();
    return;
  }

  if (selection) {
    const h = findHandleAt(e.clientX, e.clientY);
    if (h) {
      if (hoveredTextAction) {
        hoveredTextAction = null;
        render();
      }
      canvas.style.cursor = h.cursor;
      return;
    }

    if (currentTool !== 'eraser') {
      const txtOver = findTextActionAt(e.clientX, e.clientY);
      if (txtOver !== hoveredTextAction) {
        hoveredTextAction = txtOver;
        render();
      }
      if (txtOver) {
        canvas.style.cursor = 'move';
        return;
      }
    } else if (hoveredTextAction) {
      hoveredTextAction = null;
      render();
    }

    canvas.style.cursor = 'crosshair';
  }
});

canvas.addEventListener('mouseup', () => {
  if (isSelecting) {
    isSelecting = false;
    normalizeSelection();
    if (selection.w < 10 || selection.h < 10) {
      selection = null;
      render();
      return;
    }
    showToolbar();
    render();
  } else if (resizingHandle) {
    resizingHandle = null;
    normalizeSelection();
    showToolbar();
    render();
  } else if (draggingTextAction) {
    draggingTextAction = null;
    render();
  } else if (isDrawing && currentAction) {
    isDrawing = false;
    if (currentAction.points.length > 1 || currentAction.tool === 'eraser') {
      actions.push(currentAction);
    }
    currentAction = null;
    render();
  }
});

function normalizeSelection() {
  if (!selection) return;
  if (selection.w < 0) { selection.x += selection.w; selection.w = Math.abs(selection.w); }
  if (selection.h < 0) { selection.y += selection.h; selection.h = Math.abs(selection.h); }
}

function showToolbar() {
  if (!selection) return;
  drawToolbar.style.display = 'flex';
  const barWidth = drawToolbar.offsetWidth || 520;
  const leftPos = Math.min(
    window.innerWidth - barWidth - 10,
    Math.max(10, selection.x + selection.w - barWidth)
  );
  const topPos = (selection.y + selection.h + 50 < window.innerHeight)
    ? selection.y + selection.h + 10
    : Math.max(10, selection.y - 48);

  drawToolbar.style.left = `${leftPos}px`;
  drawToolbar.style.top = `${topPos}px`;
}

function openTextBox(x, y) {
  commitTextBox();
  const fontSize = Math.max(14, currentSize * 3);
  activeTextPos = { x, y, fontSize };
  textInput.style.left = `${x}px`;
  textInput.style.top = `${y - fontSize / 2}px`;
  textInput.style.color = currentColor;
  textInput.style.fontSize = `${fontSize}px`;
  textInput.style.display = 'block';
  textInput.value = '';
  setTimeout(() => textInput.focus(), 15);

  textInput.onkeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commitTextBox();
    } else if (ev.key === 'Escape') {
      activeTextPos = null;
      textInput.style.display = 'none';
      textInput.value = '';
    }
  };
}

function drawItem(targetCtx, act) {
  targetCtx.save();
  targetCtx.strokeStyle = act.color;
  targetCtx.fillStyle = act.color;
  targetCtx.lineWidth = act.size;
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';

  const pts = act.points;
  const p1 = pts[0];
  const p2 = pts[pts.length - 1];

  if (act.tool === 'eraser') {
    targetCtx.globalCompositeOperation = 'destination-out';
    targetCtx.lineWidth = act.size * 2.8;
    targetCtx.beginPath();
    pts.forEach((p, idx) => idx === 0 ? targetCtx.moveTo(p.x, p.y) : targetCtx.lineTo(p.x, p.y));
    targetCtx.stroke();
    targetCtx.restore();
    return;
  }

  if (act.tool === 'highlighter') {
    targetCtx.globalAlpha = 0.38;
    targetCtx.lineCap = 'square';
    targetCtx.lineWidth = act.size * 2.5;
  } else if (act.tool === 'brush') {
    targetCtx.shadowColor = act.color;
    targetCtx.shadowBlur = 5;
  }

  if (['pen', 'brush', 'highlighter'].includes(act.tool)) {
    targetCtx.beginPath();
    pts.forEach((p, idx) => idx === 0 ? targetCtx.moveTo(p.x, p.y) : targetCtx.lineTo(p.x, p.y));
    targetCtx.stroke();
  } else if (act.tool === 'line') {
    targetCtx.beginPath();
    targetCtx.moveTo(p1.x, p1.y);
    targetCtx.lineTo(p2.x, p2.y);
    targetCtx.stroke();
  } else if (act.tool.startsWith('arrow')) {
    drawArrow(targetCtx, p1, p2, act.tool, act.size);
  } else if (act.tool.startsWith('rect')) {
    const rx = Math.min(p1.x, p2.x);
    const ry = Math.min(p1.y, p2.y);
    const rw = Math.abs(p2.x - p1.x);
    const rh = Math.abs(p2.y - p1.y);
    if (act.tool === 'rect-outline') {
      targetCtx.strokeRect(rx, ry, rw, rh);
    } else if (act.tool === 'rect-rounded') {
      targetCtx.beginPath();
      targetCtx.roundRect(rx, ry, rw, rh, 10);
      targetCtx.stroke();
    } else if (act.tool === 'rect-filled') {
      targetCtx.globalAlpha = 0.35;
      targetCtx.fillRect(rx, ry, rw, rh);
    }
  } else if (act.tool.startsWith('circle')) {
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const radiusX = Math.abs(p2.x - p1.x) / 2;
    const radiusY = Math.abs(p2.y - p1.y) / 2;

    targetCtx.beginPath();
    targetCtx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
    if (act.tool === 'circle-outline') {
      targetCtx.stroke();
    } else if (act.tool === 'circle-filled') {
      targetCtx.globalAlpha = 0.35;
      targetCtx.fill();
    }
  } else if (act.tool === 'text') {
    targetCtx.font = `bold ${act.size}px 'Segoe UI', sans-serif`;
    targetCtx.fillText(act.text, p1.x, p1.y);
  }
  targetCtx.restore();
}

function drawArrow(targetCtx, p1, p2, type, size) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return;

  const headLen = Math.min(dist * 0.45, Math.max(12, size * 3.2));
  const shorten = headLen * 0.72;

  targetCtx.lineCap = 'butt';
  if (type === 'arrow-dashed') targetCtx.setLineDash([size * 2, size * 1.4]);

  let endAngle = Math.atan2(dy, dx);
  let startAngle = endAngle + Math.PI;

  targetCtx.beginPath();
  if (type === 'arrow-curved') {
    const cx = (p1.x + p2.x) / 2 - dy * 0.25;
    const cy = (p1.y + p2.y) / 2 + dx * 0.25;
    endAngle = Math.atan2(p2.y - cy, p2.x - cx);
    const endX = p2.x - shorten * Math.cos(endAngle);
    const endY = p2.y - shorten * Math.sin(endAngle);
    targetCtx.moveTo(p1.x, p1.y);
    targetCtx.quadraticCurveTo(cx, cy, endX, endY);
  } else {
    const startX = type === 'arrow-double' ? p1.x - shorten * Math.cos(startAngle) : p1.x;
    const startY = type === 'arrow-double' ? p1.y - shorten * Math.sin(startAngle) : p1.y;
    const endX = p2.x - shorten * Math.cos(endAngle);
    const endY = p2.y - shorten * Math.sin(endAngle);
    targetCtx.moveTo(startX, startY);
    targetCtx.lineTo(endX, endY);
  }
  targetCtx.stroke();
  targetCtx.setLineDash([]);

  drawArrowHead(targetCtx, p2.x, p2.y, endAngle, headLen);
  if (type === 'arrow-double') {
    drawArrowHead(targetCtx, p1.x, p1.y, startAngle, headLen);
  }
}

function drawArrowHead(targetCtx, x, y, angle, headLen) {
  targetCtx.beginPath();
  targetCtx.moveTo(x, y);
  targetCtx.lineTo(x - headLen * Math.cos(angle - Math.PI / 6), y - headLen * Math.sin(angle - Math.PI / 6));
  targetCtx.lineTo(x - headLen * Math.cos(angle + Math.PI / 6), y - headLen * Math.sin(angle + Math.PI / 6));
  targetCtx.closePath();
  targetCtx.fill();
}

function render(exportMode = false) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!bgImage.src) return;

  ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

  if (!exportMode) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (selection) {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    actions.forEach(act => drawItem(drawCtx, act));
    if (currentAction && (currentAction.points.length > 1 || currentAction.tool === 'eraser')) {
      drawItem(drawCtx, currentAction);
    }

    const rx = Math.min(selection.x, selection.x + selection.w);
    const ry = Math.min(selection.y, selection.y + selection.h);
    const rw = Math.abs(selection.w);
    const rh = Math.abs(selection.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();

    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(drawCanvas, 0, 0);

    // Destaca o texto quando o mouse passa por cima ou enquanto está sendo movido
    const targetText = draggingTextAction || hoveredTextAction;
    if (!exportMode && targetText && actions.includes(targetText)) {
      const b = getTextBounds(targetText);
      ctx.save();
      ctx.strokeStyle = '#3aa0f3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }

    ctx.restore();

    if (!exportMode) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();

      const handles = getResizeHandles({ x: rx, y: ry, w: rw, h: rh });
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      handles.forEach(h => {
        ctx.fillRect(h.x - 3.5, h.y - 3.5, 7, 7);
        ctx.strokeRect(h.x - 3.5, h.y - 3.5, 7, 7);
      });

      const dimLabel = `${Math.round(rw)}x${Math.round(rh)}`;
      ctx.font = 'bold 12px Segoe UI, sans-serif';
      const textWidth = ctx.measureText(dimLabel).width;
      const labelX = rx;
      const labelY = ry > 26 ? ry - 22 : ry + 6;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(labelX, labelY, textWidth + 12, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dimLabel, labelX + 6, labelY + 13);
    }
  }
}

function getCroppedCanvas() {
  commitTextBox();
  normalizeSelection();
  render(true);
  const offCanvas = document.createElement('canvas');
  offCanvas.width = selection.w;
  offCanvas.height = selection.h;
  const offCtx = offCanvas.getContext('2d');
  offCtx.drawImage(canvas, selection.x, selection.y, selection.w, selection.h, 0, 0, selection.w, selection.h);
  render(false);
  return offCanvas;
}

async function copySelection() {
  if (!selection) return;
  const offCanvas = getCroppedCanvas();
  const dataUrl = offCanvas.toDataURL('image/png');

  try {
    const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
    if (blob && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }
  } catch (e) {}

  ipcRenderer.send('copy-image', dataUrl);
}

document.getElementById('undoBtn').onclick = () => {
  closeAllSubmenus();
  commitTextBox();
  hoveredTextAction = null;
  draggingTextAction = null;
  actions.pop();
  render();
};
document.getElementById('closeBtn').onclick = () => ipcRenderer.send('close-overlay');
document.getElementById('copyBtn').onclick = () => copySelection();
document.getElementById('saveBtn').onclick = () => {
  if (selection) ipcRenderer.send('save-image', getCroppedCanvas().toDataURL('image/png'));
};

window.addEventListener('keydown', (e) => {
  if (textInput.style.display === 'block') return;
  if (e.key === 'Escape') ipcRenderer.send('close-overlay');
  if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    hoveredTextAction = null;
    draggingTextAction = null;
    actions.pop();
    render();
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'c' && selection) copySelection();
  if (e.ctrlKey && e.key.toLowerCase() === 's' && selection) {
    ipcRenderer.send('save-image', getCroppedCanvas().toDataURL('image/png'));
  }
});