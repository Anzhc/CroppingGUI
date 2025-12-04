const elements = {
  loadFolderBtn: document.getElementById('loadFolderBtn'),
  outputFolderBtn: document.getElementById('outputFolderBtn'),
  clearSelectionsBtn: document.getElementById('clearSelectionsBtn'),
  skipBtn: document.getElementById('skipBtn'),
  acceptBtn: document.getElementById('acceptBtn'),
  thumbnailGrid: document.getElementById('thumbnailGrid'),
  mainImage: document.getElementById('mainImage'),
  overlay: document.getElementById('overlay'),
  imageName: document.getElementById('imageName'),
  imageResolution: document.getElementById('imageResolution'),
  activeResolution: document.getElementById('activeResolution'),
  inputStatus: document.getElementById('inputStatus'),
  outputStatus: document.getElementById('outputStatus'),
  libraryCount: document.getElementById('libraryCount'),
  cropList: document.getElementById('cropList'),
  cropCount: document.getElementById('cropCount'),
  emptyState: document.getElementById('emptyState'),
  snapResolution: document.getElementById('snapResolution'),
  snapAspect: document.getElementById('snapAspect'),
  bucketInput: document.getElementById('bucketInput'),
  aspectInput: document.getElementById('aspectInput'),
  snapStrength: document.getElementById('snapStrength'),
  snapStrengthValue: document.getElementById('snapStrengthValue'),
};

const DEFAULT_BUCKET_TEXT = '512, 768, 1024';
const DEFAULT_ASPECT_TEXT =
  '1:1, 4:3, 3:2, 16:9, 9:16, 1:2, 2:1, 1:3, 3:1, 2:3, 3:2, 1:4, 4:1, 9:21, 21:9, 9:32, 32:9';
const SETTINGS_KEY = 'crop-gui-settings';
const DEFAULT_SNAP_STRENGTH = 1;

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function parseBuckets(value) {
  return value
    .split(',')
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseAspectRatios(value) {
  return value
    .split(',')
    .map((v) => v.trim())
    .map((str) => {
      if (!str) return null;
      if (str.includes(':')) {
        const [w, h] = str.split(':').map(Number);
        if (Number.isFinite(w) && Number.isFinite(h) && h !== 0) {
          return w / h;
        }
      }
      const num = Number(str);
      if (Number.isFinite(num) && num > 0) return num;
      return null;
    })
    .filter(Boolean);
}

function expandRatios(ratios) {
  const result = new Set();
  ratios.forEach((r) => {
    if (!Number.isFinite(r) || r <= 0) return;
    result.add(r);
    result.add(1 / r);
  });
  return Array.from(result);
}

function updateSettings() {
  state.settings.snapResolution = elements.snapResolution.checked;
  state.settings.snapAspect = elements.snapAspect.checked;
  state.settings.bucketText = elements.bucketInput.value || '';
  state.settings.aspectText = elements.aspectInput.value || '';
  state.settings.snapStrength = clamp(Number(elements.snapStrength.value), 0, 1);
  elements.snapStrengthValue.textContent = state.settings.snapStrength.toFixed(2);

  const buckets = parseBuckets(state.settings.bucketText);
  const ratios = expandRatios(parseAspectRatios(state.settings.aspectText));

  if (buckets.length) state.settings.buckets = buckets;
  if (ratios.length) state.settings.aspectRatios = ratios;
  saveSettings();
}

const state = {
  images: [],
  currentIndex: -1,
  selections: [],
  naturalSize: { width: 0, height: 0 },
  inputDir: null,
  outputDir: null,
  settings: {
    snapResolution: true,
    snapAspect: false,
    buckets: parseBuckets(DEFAULT_BUCKET_TEXT),
    aspectRatios: expandRatios(parseAspectRatios(DEFAULT_ASPECT_TEXT)),
    bucketText: DEFAULT_BUCKET_TEXT,
    aspectText: DEFAULT_ASPECT_TEXT,
    snapStrength: DEFAULT_SNAP_STRENGTH,
  },
  contextMenu: null,
  drawing: false,
  startPoint: null,
  liveRect: null,
  moveState: null,
  resizeState: null,
  altResizing: false,
};

function saveSettings() {
  try {
    const payload = {
      snapResolution: state.settings.snapResolution,
      snapAspect: state.settings.snapAspect,
      bucketText: state.settings.bucketText,
      aspectText: state.settings.aspectText,
      snapStrength: state.settings.snapStrength,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to save settings', error);
  }
}

function loadSettings() {
  let stored = {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to load settings', error);
  }

  const bucketText = stored.bucketText || DEFAULT_BUCKET_TEXT;
  const aspectText = stored.aspectText || DEFAULT_ASPECT_TEXT;
  elements.bucketInput.value = bucketText;
  elements.aspectInput.value = aspectText;
  elements.snapResolution.checked = stored.snapResolution ?? true;
  elements.snapAspect.checked = stored.snapAspect ?? false;
  const snapStrength = clamp(Number(stored.snapStrength ?? DEFAULT_SNAP_STRENGTH), 0, 1);
  elements.snapStrength.value = snapStrength;
  elements.snapStrengthValue.textContent = snapStrength.toFixed(2);

  state.settings.bucketText = bucketText;
  state.settings.aspectText = aspectText;
  state.settings.snapResolution = elements.snapResolution.checked;
  state.settings.snapAspect = elements.snapAspect.checked;
  state.settings.snapStrength = snapStrength;

  const buckets = parseBuckets(bucketText);
  const ratios = expandRatios(parseAspectRatios(aspectText));
  if (buckets.length) {
    state.settings.buckets = buckets;
  } else {
    state.settings.buckets = parseBuckets(DEFAULT_BUCKET_TEXT);
    elements.bucketInput.value = DEFAULT_BUCKET_TEXT;
    state.settings.bucketText = DEFAULT_BUCKET_TEXT;
  }

  if (ratios.length) {
    state.settings.aspectRatios = ratios;
  } else {
    state.settings.aspectRatios = expandRatios(parseAspectRatios(DEFAULT_ASPECT_TEXT));
    elements.aspectInput.value = DEFAULT_ASPECT_TEXT;
    state.settings.aspectText = DEFAULT_ASPECT_TEXT;
  }

  saveSettings();
}

function setStatus(inputDir, outputDir) {
  elements.inputStatus.textContent = `Input: ${inputDir || '—'}`;
  elements.outputStatus.textContent = `Output: ${outputDir || '—'}`;
}

function getCurrentImage() {
  if (state.currentIndex < 0) return null;
  return state.images[state.currentIndex];
}

function refreshCounts() {
  elements.libraryCount.textContent = state.images.length;
}

function toFileUrl(filePath) {
  return window.api.toFileUrl(filePath);
}

function clearContextMenu() {
  if (state.contextMenu) {
    state.contextMenu.remove();
    state.contextMenu = null;
  }
}

function showContextMenu(x, y, filePath) {
  clearContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete crop';
  deleteBtn.onclick = async () => {
    clearContextMenu();
    const res = await window.api.deleteCrop(filePath);
    if (res.success) {
      refreshCrops();
    } else {
      console.error(res.error);
    }
  };
  menu.appendChild(deleteBtn);
  document.body.appendChild(menu);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  state.contextMenu = menu;
}

function pointInsideImage(event) {
  const imgRect = elements.mainImage.getBoundingClientRect();
  return (
    event.clientX >= imgRect.left &&
    event.clientX <= imgRect.right &&
    event.clientY >= imgRect.top &&
    event.clientY <= imgRect.bottom
  );
}

function getScaleInfo() {
  const imgRect = elements.mainImage.getBoundingClientRect();
  const overlayRect = elements.overlay.getBoundingClientRect();
  const scaleX = imgRect.width ? state.naturalSize.width / imgRect.width : 1;
  const scaleY = imgRect.height ? state.naturalSize.height / imgRect.height : 1;
  return {
    imgRect,
    overlayRect,
    scaleX: Number.isFinite(scaleX) ? scaleX : 1,
    scaleY: Number.isFinite(scaleY) ? scaleY : 1,
  };
}

function toImageSpace(event) {
  const { imgRect, scaleX, scaleY } = getScaleInfo();
  const x = clamp(event.clientX - imgRect.left, 0, imgRect.width);
  const y = clamp(event.clientY - imgRect.top, 0, imgRect.height);
  return {
    x: x * scaleX,
    y: y * scaleY,
  };
}

function toOverlaySpace(rect) {
  const { imgRect, overlayRect, scaleX, scaleY } = getScaleInfo();
  return {
    x: imgRect.left - overlayRect.left + rect.x / scaleX,
    y: imgRect.top - overlayRect.top + rect.y / scaleY,
    width: rect.width / scaleX,
    height: rect.height / scaleY,
  };
}

function positionHandle(el, view, handle) {
  const cx = view.width / 2;
  const cy = view.height / 2;
  const positions = {
    topleft: [0, 0],
    topright: [view.width, 0],
    bottomleft: [0, view.height],
    bottomright: [view.width, view.height],
    left: [0, cy],
    right: [view.width, cy],
    top: [cx, 0],
    bottom: [cx, view.height],
  };
  const pos = positions[handle] || [cx, cy];
  el.style.left = `${pos[0]}px`;
  el.style.top = `${pos[1]}px`;
}

function closestAspect(target, ratios) {
  let best = ratios[0];
  let bestDiff = Math.abs(target - best);
  for (const ratio of ratios) {
    const diff = Math.abs(target - ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ratio;
    }
  }
  return best;
}

function findBucketTarget(width, height) {
  const ratios = state.settings.aspectRatios.length ? state.settings.aspectRatios : [width / height || 1];
  const buckets = state.settings.buckets;
  const power = state.settings.snapStrength;
  if (power <= 0) return null;
  let best = null;
  let bestScore = Infinity;

  for (const bucket of buckets) {
    for (const ratio of ratios) {
      const w = Math.round(bucket * Math.sqrt(ratio));
      const h = Math.round(bucket / Math.sqrt(ratio));
      const score = Math.hypot(width - w, height - h);
      if (score < bestScore) {
        bestScore = score;
        best = { width: w, height: h };
      }
    }
  }

  const baseThreshold = Math.max(120, Math.min(width, height) * 0.35);
  const threshold = baseThreshold * power;
  if (best && bestScore <= threshold) {
    return best;
  }
  return null;
}

function applySnap(rect) {
  let { width, height } = rect;
  const aspect = width && height ? width / height : 1;
  const power = state.settings.snapStrength;
  if (power <= 0) return rect;

  if (state.settings.snapAspect && state.settings.aspectRatios.length) {
    const target = closestAspect(aspect, state.settings.aspectRatios);
    const optionA = { width, height: width / target };
    const optionB = { width: height * target, height };
    const diffA = Math.abs(optionA.height - height);
    const diffB = Math.abs(optionB.width - width);
    const chosen = diffA <= diffB ? optionA : optionB;
    const delta = diffA <= diffB ? diffA : diffB;
    const baseThreshold = Math.max(8, Math.min(width, height) * 0.25);
    const threshold = baseThreshold * power;
    if (delta <= threshold) {
      width = chosen.width;
      height = chosen.height;
    }
  }

  if (state.settings.snapResolution && state.settings.buckets.length) {
    const bucketTarget = findBucketTarget(width, height);
    if (bucketTarget) {
      width = bucketTarget.width;
      height = bucketTarget.height;
    }
  }

  return { ...rect, width, height };
}

function buildDragRect(start, current) {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const dirX = dx >= 0 ? 1 : -1;
  const dirY = dy >= 0 ? 1 : -1;
  const snapped = applySnap({ width: Math.abs(dx), height: Math.abs(dy) });
  const rect = {
    x: dirX >= 0 ? start.x : start.x - snapped.width,
    y: dirY >= 0 ? start.y : start.y - snapped.height,
    width: snapped.width,
    height: snapped.height,
  };
  return clampRectToImage(rect);
}

function describeRect(rect) {
  if (!rect || !rect.width || !rect.height) return null;
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const ratio = h ? (w / h).toFixed(2) : '—';
  return `${w} × ${h} (${ratio})`;
}

function renderSelections() {
  elements.overlay.innerHTML = '';
  elements.overlay.classList.toggle('overlay-alt', state.altResizing);
  elements.overlay.style.position = 'absolute';

  state.selections.forEach((rect, idx) => {
    const view = toOverlaySpace(rect);
    const el = document.createElement('div');
    el.className = 'crop-rect';
    el.style.left = `${view.x}px`;
    el.style.top = `${view.y}px`;
    el.style.width = `${view.width}px`;
    el.style.height = `${view.height}px`;
    el.dataset.index = idx;
    const label = document.createElement('div');
    label.className = 'crop-label';
    label.textContent = describeRect(rect);
    el.appendChild(label);
    if (state.altResizing) {
      ['topleft', 'top', 'topright', 'left', 'right', 'bottomleft', 'bottom', 'bottomright'].forEach((handle) => {
        const h = document.createElement('div');
        h.className = 'resize-handle';
        h.dataset.handle = handle;
        positionHandle(h, view, handle);
        el.appendChild(h);
      });
    }
    elements.overlay.appendChild(el);
  });

  if (state.liveRect) {
    const view = toOverlaySpace(state.liveRect);
    const el = document.createElement('div');
    el.className = 'crop-rect active';
    el.style.left = `${view.x}px`;
    el.style.top = `${view.y}px`;
    el.style.width = `${view.width}px`;
    el.style.height = `${view.height}px`;
    const label = document.createElement('div');
    label.className = 'crop-label';
    label.textContent = describeRect(state.liveRect);
    el.appendChild(label);
    if (state.altResizing) {
      ['topleft', 'top', 'topright', 'left', 'right', 'bottomleft', 'bottom', 'bottomright'].forEach((handle) => {
        const h = document.createElement('div');
        h.className = 'resize-handle';
        h.dataset.handle = handle;
        positionHandle(h, view, handle);
        el.appendChild(h);
      });
    }
    elements.overlay.appendChild(el);
  }

  if (state.altResizing) {
    const hint = document.createElement('div');
    hint.className = 'alt-hint';
    hint.textContent = 'Alt: drag handles to resize';
    elements.overlay.appendChild(hint);
  }
}

function resetSelections() {
  state.selections = [];
  state.liveRect = null;
  renderSelections();
}

function selectImage(index) {
  if (index < 0 || index >= state.images.length) {
    state.currentIndex = -1;
    elements.imageName.textContent = 'No image loaded';
    elements.imageResolution.textContent = 'Resolution: —';
    elements.mainImage.src = '';
    elements.mainImage.classList.add('hidden');
    state.naturalSize = { width: 0, height: 0 };
    resetSelections();
    elements.emptyState.style.display = 'flex';
    refreshThumbs();
    return;
  }

  state.currentIndex = index;
  const item = state.images[index];
  elements.imageName.textContent = item.name;
  elements.mainImage.classList.remove('hidden');
  elements.mainImage.src = toFileUrl(item.path);
  elements.emptyState.style.display = 'none';
  resetSelections();
  refreshThumbs();
}

function refreshThumbs() {
  elements.thumbnailGrid.innerHTML = '';

  state.images.forEach((img, idx) => {
    const thumb = document.createElement('div');
    thumb.className = `thumb ${idx === state.currentIndex ? 'active' : ''}`;
    const imageEl = document.createElement('img');
    imageEl.src = toFileUrl(img.path);
    const name = document.createElement('div');
    name.className = 'thumb-name';
    name.textContent = img.name;
    thumb.append(imageEl, name);
    thumb.onclick = () => selectImage(idx);
    elements.thumbnailGrid.appendChild(thumb);
  });

  refreshCounts();
}

async function loadFolder() {
  const dir = await window.api.selectFolder();
  if (!dir) return;
  state.inputDir = dir;
  if (!state.outputDir) {
    state.outputDir = dir;
  }
  setStatus(state.inputDir, state.outputDir);

  const res = await window.api.readImages(dir);
  if (!res.success) {
    console.error(res.error);
    return;
  }

  state.images = res.images;
  refreshThumbs();
  selectImage(res.images.length ? 0 : -1);
  refreshCrops();
}

async function chooseOutput() {
  const dir = await window.api.selectFolder();
  if (!dir) return;
  state.outputDir = dir;
  setStatus(state.inputDir, state.outputDir);
  refreshCrops();
}

async function refreshCrops() {
  if (!state.outputDir) {
    elements.cropList.innerHTML = '';
    elements.cropCount.textContent = '0';
    return;
  }

  const res = await window.api.listCrops(state.outputDir);
  if (!res.success) {
    console.error(res.error);
    return;
  }

  elements.cropList.innerHTML = '';
  elements.cropCount.textContent = res.crops.length;

  res.crops.forEach((crop) => {
    const item = document.createElement('div');
    item.className = 'crop-item';
    item.oncontextmenu = (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, crop.path);
    };
    const img = document.createElement('img');
    img.src = toFileUrl(crop.path);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = crop.name;
    item.append(img, name);
    elements.cropList.appendChild(item);
  });
}

function handleMouseDown(event) {
  if (event.button !== 0 || !getCurrentImage()) return;
  const target = event.target;

  if (state.altResizing) {
    const handleEl = target.closest('.resize-handle');
    const rectEl = target.closest('.crop-rect');
    if (handleEl && rectEl && handleEl.dataset.handle && rectEl.dataset.index) {
      const idx = Number(rectEl.dataset.index);
      const handle = handleEl.dataset.handle;
      if (Number.isFinite(idx)) {
        const startRect = { ...state.selections[idx] };
        state.resizeState = {
          index: idx,
          handle,
          startPoint: toImageSpace(event),
          startRect,
          anchor: anchorForHandle(handle, startRect),
        };
        return;
      }
    }
    return;
  }

  if (event.ctrlKey) {
    const rectEl = target.closest('.crop-rect');
    if (!rectEl) return;
    const idx = Number(rectEl.dataset.index);
    if (Number.isFinite(idx)) {
      state.moveState = {
        index: idx,
        startPoint: toImageSpace(event),
        origin: { ...state.selections[idx] },
      };
    }
    return;
  }

  if (!pointInsideImage(event)) return;
  state.drawing = true;
  state.startPoint = toImageSpace(event);
  state.liveRect = null;
}

function handleMouseMove(event) {
  if (state.resizeState && getCurrentImage()) {
    const current = toImageSpace(event);
    const dx = current.x - state.resizeState.startPoint.x;
    const dy = current.y - state.resizeState.startPoint.y;
    const resized = resizeWithHandle(state.resizeState.startRect, state.resizeState.handle, dx, dy);
    const snapped = applySnapWithAnchor(resized, state.resizeState.handle, state.resizeState.anchor);
    state.selections[state.resizeState.index] = snapped;
    renderSelections();
    return;
  }
  if (state.moveState && getCurrentImage()) {
    const current = toImageSpace(event);
    const dx = current.x - state.moveState.startPoint.x;
    const dy = current.y - state.moveState.startPoint.y;
    const orig = state.moveState.origin;
    const moved = clampRectPosition({
      x: orig.x + dx,
      y: orig.y + dy,
      width: orig.width,
      height: orig.height,
    });
    state.selections[state.moveState.index] = moved;
    renderSelections();
    return;
  }

  if (!state.drawing || !getCurrentImage()) return;
  const currentPoint = toImageSpace(event);
  const rect = buildDragRect(state.startPoint, currentPoint);
  state.liveRect = rect;
  renderSelections();
}

function handleMouseUp(event) {
  if (state.resizeState) {
    state.resizeState = null;
    return;
  }
  if (state.moveState) {
    state.moveState = null;
    return;
  }

  if (event.button !== undefined && event.button !== 0) return;
  if (!state.drawing || !getCurrentImage()) return;
  state.drawing = false;
  const endPoint = toImageSpace(event);
  const rect = buildDragRect(state.startPoint, endPoint);
  if (rect.width > 4 && rect.height > 4) {
    state.selections.push(rect);
  }
  state.liveRect = null;
  renderSelections();
}

function handleDoubleClick(event) {
  const target = event.target;
  if (target.classList.contains('crop-rect') && target.dataset.index) {
    const idx = Number(target.dataset.index);
    if (Number.isFinite(idx)) {
      state.selections.splice(idx, 1);
      renderSelections();
    }
  }
}

function handleContextDelete(event) {
  const rectEl = event.target.closest('.crop-rect');
  if (!rectEl || rectEl.dataset.index === undefined) return;
  event.preventDefault();
  const idx = Number(rectEl.dataset.index);
  if (Number.isFinite(idx)) {
    state.selections.splice(idx, 1);
    renderSelections();
  }
}

function clampRectToImage(rect) {
  let { x, y, width, height } = rect;
  const maxW = state.naturalSize.width;
  const maxH = state.naturalSize.height;

  if (x < 0) {
    width += x;
    x = 0;
  }
  if (y < 0) {
    height += y;
    y = 0;
  }
  if (x + width > maxW) {
    width = maxW - x;
  }
  if (y + height > maxH) {
    height = maxH - y;
  }

  width = Math.max(0, width);
  height = Math.max(0, height);

  return { x, y, width, height };
}

function clampRectPosition(rect) {
  const maxX = Math.max(0, state.naturalSize.width - rect.width);
  const maxY = Math.max(0, state.naturalSize.height - rect.height);
  return {
    ...rect,
    x: clamp(rect.x, 0, maxX),
    y: clamp(rect.y, 0, maxY),
  };
}

function anchorForHandle(handle, rect) {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return {
    x: handle.includes('left') ? right : rect.x,
    y: handle.includes('top') ? bottom : rect.y,
  };
}

function resizeWithHandle(startRect, handle, dx, dy) {
  const rect = { ...startRect };
  if (handle.includes('left')) {
    rect.x += dx;
    rect.width -= dx;
  }
  if (handle.includes('right')) {
    rect.width += dx;
  }
  if (handle.includes('top')) {
    rect.y += dy;
    rect.height -= dy;
  }
  if (handle.includes('bottom')) {
    rect.height += dy;
  }
  rect.width = Math.max(2, rect.width);
  rect.height = Math.max(2, rect.height);
  return rect;
}

function applySnapWithAnchor(rect, handle, anchor) {
  const isCorner =
    (handle.includes('top') || handle.includes('bottom')) &&
    (handle.includes('left') || handle.includes('right'));

  if (!isCorner) {
    // Edge drag: snap along the dragged axis, keep the opposite edge fixed.
    const base = applySnap(rect);
    const result = { ...rect };

    if (handle.includes('left') || handle.includes('right')) {
      // Horizontal drag: snap width only, keep height unchanged.
      result.width = base.width;
    }
    if (handle.includes('top') || handle.includes('bottom')) {
      // Vertical drag: snap height only, keep width unchanged.
      result.height = base.height;
    }

    let x = result.x;
    let y = result.y;
    if (handle.includes('left')) {
      x = anchor.x - result.width;
    } else if (handle.includes('right')) {
      x = anchor.x;
    }
    if (handle.includes('top')) {
      y = anchor.y - result.height;
    } else if (handle.includes('bottom')) {
      y = anchor.y;
    }

    return clampRectToImage({ ...result, x, y });
  }

  const snapped = applySnap(rect);

  let x = snapped.x;
  let y = snapped.y;
  if (handle.includes('left')) {
    x = anchor.x - snapped.width;
  } else if (handle.includes('right')) {
    x = anchor.x;
  }
  if (handle.includes('top')) {
    y = anchor.y - snapped.height;
  } else if (handle.includes('bottom')) {
    y = anchor.y;
  }

  return clampRectToImage({ ...snapped, x, y });
}

async function acceptImage() {
  const current = getCurrentImage();
  if (!current) return;

  const outputDir = state.outputDir || state.inputDir;
  if (!outputDir) {
    alert('Select an output folder first.');
    return;
  }

  if (state.selections.length) {
    const res = await window.api.saveCrops({
      imagePath: current.path,
      crops: state.selections,
      outputDir,
    });
    if (!res.success) {
      console.error(res.error);
    } else if (res.saved?.length) {
      await refreshCrops();
    }
  }

  state.images.splice(state.currentIndex, 1);
  const nextIndex = state.currentIndex >= state.images.length ? state.images.length - 1 : state.currentIndex;
  selectImage(nextIndex);
  refreshThumbs();
}

async function skipImage() {
  state.selections = [];
  await acceptImage();
}

function setupImageLoadListener() {
  elements.mainImage.addEventListener('load', () => {
    state.naturalSize = {
      width: elements.mainImage.naturalWidth,
      height: elements.mainImage.naturalHeight,
    };
    elements.imageResolution.textContent = `Resolution: ${state.naturalSize.width} × ${state.naturalSize.height}`;
    elements.mainImage.classList.remove('hidden');
    renderSelections();
  });

  elements.mainImage.addEventListener('error', () => {
    elements.mainImage.classList.add('hidden');
  });
}

function setupEvents() {
  elements.loadFolderBtn.onclick = loadFolder;
  elements.outputFolderBtn.onclick = chooseOutput;
  elements.clearSelectionsBtn.onclick = resetSelections;
  elements.acceptBtn.onclick = acceptImage;
  elements.skipBtn.onclick = skipImage;

  elements.overlay.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('blur', () => {
    if (state.resizeState || state.moveState || state.drawing) {
      state.resizeState = null;
      state.moveState = null;
      state.drawing = false;
      state.liveRect = null;
      renderSelections();
    }
  });
  window.addEventListener('resize', renderSelections);
  elements.overlay.addEventListener('dblclick', handleDoubleClick);
  elements.overlay.addEventListener('contextmenu', handleContextDelete);

  elements.snapResolution.onchange = updateSettings;
  elements.snapAspect.onchange = updateSettings;
  elements.bucketInput.onchange = updateSettings;
  elements.aspectInput.onchange = updateSettings;
  elements.snapStrength.oninput = updateSettings;

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Alt') {
      if (!state.altResizing) {
        state.altResizing = true;
        renderSelections();
      }
    }
    if (event.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') {
      acceptImage();
    } else if (event.key === 'Escape') {
      resetSelections();
    }
  });

  document.addEventListener('keyup', (event) => {
    if (event.key === 'Alt') {
      state.altResizing = false;
      state.resizeState = null;
      renderSelections();
    }
  });

  document.addEventListener('click', clearContextMenu);
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.crop-item')) {
      clearContextMenu();
    }
  });
}

function init() {
  loadSettings();
  setupEvents();
  setupImageLoadListener();
  setStatus(state.inputDir, state.outputDir);
  refreshCounts();
}

init();
