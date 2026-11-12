const { ipcRenderer } = require('electron');

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Camada independente exclusiva para anotações (permite que a Borracha apague sem afetar o fundo)
const drawCanvas = document.createElement('canvas');
const drawCtx = drawCanvas.getContext('2d');

const drawToolbar = document.getElementById('drawToolbar');
const textInput = document.getElementById('textInput');
const sizeSlider = document.getElementById('strokeSize');
const sizeCircle = document.getElementById('sizeCircle');
const arrowSelect = document.getElementById('arrowType');
const rectSelect = document.getElementById('rectType');

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
let currentColor = '#ff2e2e';
let currentSize = 5;

let actions = [];
let currentAction = null;
let activeTextPos = null;

function updateSizeIndicator() {
  sizeSlider.value = currentSize;
  const visualDiameter = Math.max(4, Math.min(20, currentSize));
  sizeCircle.style.width = `${visualDiameter}px`;
  sizeCircle.style.height = `${visualDiameter}px`;
  sizeCircle.style.background = currentTool === 'eraser' ? '#ffffff' : currentColor;
}
updateSizeIndicator();

ipcRenderer.on('screen-captured', (event, dataUrl) => {
  selection = null;
  isSelecting = false;
  resizingHandle = null;
  isDrawing = false;
  actions = [];
  currentAction = null;
  activeTextPos = null;
  drawToolbar.style.display = 'none';
  textInput.style.display = 'none';

  bgImage = new Image();
  bgImage.onload = () => render();
  bgImage.src = dataUrl;
});

function clearActiveStates() {
  document.querySelectorAll('#drawToolbar .icon-btn[data-tool]').forEach(b => b.classList.remove('active'));
  arrowSelect.classList.remove('active');
  rectSelect.classList.remove('active');
}

document.querySelectorAll('#drawToolbar .icon-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    commitTextBox();
    clearActiveStates();
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
    updateSizeIndicator();
  });
});

arrowSelect.addEventListener('click', () => {
  commitTextBox();
  clearActiveStates();
  arrowSelect.classList.add('active');
  currentTool = arrowSelect.value;
});
arrowSelect.addEventListener('change', (e) => {
  commitTextBox();
  clearActiveStates();
  arrowSelect.classList.add('active');
  currentTool = e.target.value;
});

rectSelect.addEventListener('click', () => {
  commitTextBox();
  clearActiveStates();
  rectSelect.classList.add('active');
  currentTool = rectSelect.value;
});
rectSelect.addEventListener('change', (e) => {
  commitTextBox();
  clearActiveStates();
  rectSelect.classList.add('active');
  currentTool = e.target.value;
});

document.querySelectorAll('.swatch').forEach(s => {
  s.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(el => el.classList.remove('selected'));
    s.classList.add('selected');
    currentColor = s.dataset.color;
    document.getElementById('colorPicker').value = currentColor;
    textInput.style.color = currentColor;
    updateSizeIndicator();
  });
});

document.getElementById('colorPicker').addEventListener('input', (e) => {
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

// Alças de redimensionamento da seleção (8 pontos estilo Lightshot)
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

// Confirma e insere o texto tanto no Enter quanto ao clicar fora
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
  // Se o campo de texto estiver aberto e o usuário clicar fora, insere o texto imediatamente
  if (textInput.style.display === 'block') {
    commitTextBox();
    return;
  }

  if (!selection) {
    isSelecting = true;
    selection = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
    return;
  }

  // Verifica se clicou em uma das 8 alças para redimensionar a área selecionada
  const handle = findHandleAt(e.clientX, e.clientY);
  if (handle) {
    resizingHandle = handle.id;
    drawToolbar.style.display = 'none';
    return;
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

  if (isDrawing && currentAction) {
    if (['pen', 'brush', 'highlighter', 'eraser'].includes(currentTool)) {
      currentAction.points.push({ x: e.clientX, y: e.clientY });
    } else {
      currentAction.points[1] = { x: e.clientX, y: e.clientY };
    }
    render();
    return;
  }

  // Atualiza o cursor ao passar sobre as 8 alças da seleção
  if (selection) {
    const h = findHandleAt(e.clientX, e.clientY);
    canvas.style.cursor = h ? h.cursor : 'crosshair';
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
  const barWidth = drawToolbar.offsetWidth || 610;
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
    // Renderiza todas as anotações e borracha na camada transparente separada
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
    ctx.restore();

    if (!exportMode) {
      // Borda tracejada estilo Lightshot
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();

      // 8 quadradinhos de redimensionamento
      const handles = getResizeHandles({ x: rx, y: ry, w: rw, h: rh });
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      handles.forEach(h => {
        ctx.fillRect(h.x - 3.5, h.y - 3.5, 7, 7);
        ctx.strokeRect(h.x - 3.5, h.y - 3.5, 7, 7);
      });

      // Indicador de tamanho (ex: 449x350) no canto superior esquerdo
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

document.getElementById('undoBtn').onclick = () => { commitTextBox(); actions.pop(); render(); };
document.getElementById('closeBtn').onclick = () => ipcRenderer.send('close-overlay');
document.getElementById('copyBtn').onclick = () => copySelection();
document.getElementById('saveBtn').onclick = () => {
  if (selection) ipcRenderer.send('save-image', getCroppedCanvas().toDataURL('image/png'));
};

window.addEventListener('keydown', (e) => {
  if (textInput.style.display === 'block') return;
  if (e.key === 'Escape') ipcRenderer.send('close-overlay');
  if (e.ctrlKey && e.key.toLowerCase() === 'z') { actions.pop(); render(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'c' && selection) copySelection();
  if (e.ctrlKey && e.key.toLowerCase() === 's' && selection) {
    ipcRenderer.send('save-image', getCroppedCanvas().toDataURL('image/png'));
  }
});