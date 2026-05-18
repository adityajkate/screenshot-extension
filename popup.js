let currentScreenshotData = null;
let currentFilename = null;

document.getElementById('captureViewport').addEventListener('click', () => {
  captureScreenshot('viewport');
});

document.getElementById('captureFullPage').addEventListener('click', () => {
  captureScreenshot('fullpage');
});

document.getElementById('closePreview').addEventListener('click', () => {
  hidePreview();
});

document.getElementById('copyToClipboard').addEventListener('click', () => {
  copyToClipboard();
});

document.getElementById('downloadImage').addEventListener('click', () => {
  downloadImage();
});

async function captureScreenshot(type) {
  try {
    showStatus('Capturing screenshot...');
    disableButtons(true);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (type === 'viewport') {
      await captureViewport(tab);
    } else {
      await captureFullPage(tab);
    }
  } catch (error) {
    console.error('Screenshot error:', error);
    showStatus('Failed to capture');
    setTimeout(() => hideStatus(), 2000);
    disableButtons(false);
  }
}

async function captureViewport(tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: 'png',
    quality: 100
  });

  currentScreenshotData = dataUrl;
  currentFilename = generateFilename(tab.title, 'viewport');

  hideStatus();
  showPreview(dataUrl);
  disableButtons(false);
}

async function captureFullPage(tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: getPageDimensions
  });

  const dimensions = result[0].result;

  const originalViewport = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ x: window.scrollX, y: window.scrollY })
  });

  const screenshots = [];
  const viewportHeight = dimensions.viewportHeight;
  const totalHeight = dimensions.scrollHeight;

  for (let y = 0; y < totalHeight; y += viewportHeight) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (scrollY) => window.scrollTo(0, scrollY),
      args: [y]
    });

    await new Promise(resolve => setTimeout(resolve, 150));

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });

    screenshots.push(dataUrl);
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (pos) => window.scrollTo(pos.x, pos.y),
    args: [originalViewport[0].result]
  });

  const stitchedImage = await stitchImages(screenshots, dimensions);

  currentScreenshotData = stitchedImage;
  currentFilename = generateFilename(tab.title, 'fullpage');

  hideStatus();
  showPreview(stitchedImage);
  disableButtons(false);
}

function getPageDimensions() {
  return {
    scrollHeight: Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.body.clientHeight,
      document.documentElement.clientHeight
    ),
    scrollWidth: Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
      document.body.offsetWidth,
      document.documentElement.offsetWidth,
      document.body.clientWidth,
      document.documentElement.clientWidth
    ),
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth
  };
}

async function stitchImages(screenshots, dimensions) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.viewportWidth;
    canvas.height = dimensions.scrollHeight;
    const ctx = canvas.getContext('2d');

    let loadedCount = 0;
    const images = [];

    screenshots.forEach((dataUrl, index) => {
      const img = new Image();
      img.onload = () => {
        images[index] = img;
        loadedCount++;

        if (loadedCount === screenshots.length) {
          images.forEach((img, i) => {
            const y = i * dimensions.viewportHeight;
            ctx.drawImage(img, 0, y);
          });

          resolve(canvas.toDataURL('image/png', 1.0));
        }
      };
      img.src = dataUrl;
    });
  });
}

function generateFilename(pageTitle, type) {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const sanitizedTitle = pageTitle.replace(/[^a-z0-9]/gi, '-').slice(0, 50);
  return `capture-${sanitizedTitle}-${type}-${timestamp}.png`;
}

function showPreview(dataUrl) {
  document.getElementById('previewImage').src = dataUrl;
  document.getElementById('preview').classList.remove('hidden');
}

function hidePreview() {
  document.getElementById('preview').classList.add('hidden');
  currentScreenshotData = null;
  currentFilename = null;
}

async function copyToClipboard() {
  try {
    const blob = await (await fetch(currentScreenshotData)).blob();

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);

    const btn = document.getElementById('copyToClipboard');
    const textEl = btn.querySelector('.preview-btn-text');
    const originalText = textEl.textContent;

    textEl.textContent = 'Copied';
    btn.disabled = true;

    setTimeout(() => {
      textEl.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Copy error:', error);
  }
}

function downloadImage() {
  const link = document.createElement('a');
  link.href = currentScreenshotData;
  link.download = currentFilename;
  link.click();

  const btn = document.getElementById('downloadImage');
  const textEl = btn.querySelector('.preview-btn-text');
  const originalText = textEl.textContent;

  textEl.textContent = 'Downloaded';
  btn.disabled = true;

  setTimeout(() => {
    textEl.textContent = originalText;
    btn.disabled = false;
  }, 2000);
}

function showStatus(message) {
  const status = document.getElementById('status');
  const textEl = status.querySelector('.status-text');
  textEl.textContent = message;
  status.classList.remove('hidden');
}

function hideStatus() {
  const status = document.getElementById('status');
  status.classList.add('hidden');
}

function disableButtons(disabled) {
  document.getElementById('captureViewport').disabled = disabled;
  document.getElementById('captureFullPage').disabled = disabled;
}
