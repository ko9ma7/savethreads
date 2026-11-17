// script.js

const form = document.getElementById("download-form");
const urlInput = document.getElementById("thread-url");
const clearBtn = document.getElementById("clear-btn");
const submitBtn = document.getElementById("submit-btn");
const statusMessage = document.getElementById("status-message");
const resultSection = document.getElementById("result-section");

const authorAvatar = document.getElementById("author-avatar");
const authorName = document.getElementById("author-name");
const authorHandle = document.getElementById("author-handle");
const postCaption = document.getElementById("post-caption");
const mediaList = document.getElementById("media-list");
const themeToggle = document.getElementById("theme-toggle");

// 다크/라이트 테마 전환
themeToggle.addEventListener("click", () => {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
});

// 입력창 X(지우기) 버튼 노출 제어
urlInput.addEventListener("input", () => {
  clearBtn.classList.toggle("hidden", !urlInput.value.trim());
});

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  clearBtn.classList.add("hidden");
  urlInput.focus();
});

// Threads URL 검증 및 정규화 (threads.com -> threads.net 변환 및 불필요 쿼리 제거)
function normalizeThreadsUrl(rawUrl) {
  try {
    const u = new URL(rawUrl.trim());
    if (!/^(www\.)?threads\.(net|com)$/i.test(u.hostname)) return null;
    const match = u.pathname.match(/\/(@[\w.]+\/post\/[a-zA-Z0-9_-]+|t\/[a-zA-Z0-9_-]+)/);
    if (!match) return null;
    return `https://www.threads.net/${match[1]}`;
  } catch {
    return null;
  }
}

function extractHandleFromUrl(url) {
  const m = url.match(/\/@([\w.]+)\//);
  return m ? m[1] : "threads_user";
}

function showStatus(msg, isError = false) {
  statusMessage.textContent = msg;
  statusMessage.className = `status-message ${isError ? "error" : ""}`;
}

function hideStatus() {
  statusMessage.className = "status-message hidden";
}

// 유니코드 및 HTML 이스케이프 문자 디코딩 (\u0026 -> &, \/ -> /)
function decodeEscapedString(str) {
  if (!str) return "";
  try {
    return JSON.parse(`"${str.replace(/"/g, '\\"')}"`);
  } catch {
    return str
      .replace(/\\u0026/g, "&")
      .replace(/\\u003C/g, "<")
      .replace(/\\u003E/g, ">")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");
  }
}

// GitHub Pages 정적 환경용 다중 CORS 프록시 폴백 호출
async function fetchHtmlViaProxy(targetUrl) {
  const proxies = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  for (const buildProxyUrl of proxies) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(buildProxyUrl(targetUrl), { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        if (text && (text.includes("og:") || text.includes("video_versions") || text.includes("image_versions2"))) {
          return text;
        }
      }
    } catch {
      // 현재 프록시 실패 시 다음 프록시로 자동 전환
    }
  }
  throw new Error("게시물 데이터를 가져오지 못했습니다. 공개 게시물인지 확인하거나 잠시 후 다시 시도해 주세요.");
}

// Threads HTML 내부 Relay JSON 및 OpenGraph 메타태그 파싱
function parseThreadsHtml(html, cleanUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const getMeta = (prop) =>
    doc.querySelector(`meta[property="${prop}"]`)?.getAttribute("content") ||
    doc.querySelector(`meta[name="${prop}"]`)?.getAttribute("content") ||
    "";

  const handle = extractHandleFromUrl(cleanUrl);
  let displayName = handle.toUpperCase();
  let caption = getMeta("og:description") || "";
  let avatar = "";

  // og:title 예: "CHOI (@choi.openai) on Threads" 에서 닉네임 분리
  const ogTitle = getMeta("og:title");
  if (ogTitle) {
    const titleMatch = ogTitle.match(/^(.+?)\s*\(@[\w.]+\)/);
    if (titleMatch) displayName = titleMatch[1].trim();
  }

  // Relay JSON 내 상세 본문 및 프로필 이미지 추출
  const captionMatch = html.match(/"caption":\{"text":"((?:\\.|[^"\\])*)"/);
  if (captionMatch && captionMatch[1]) {
    caption = decodeEscapedString(captionMatch[1]);
  }

  const profilePicMatch = html.match(/"profile_pic_url":"((?:\\.|[^"\\])*)"/);
  if (profilePicMatch && profilePicMatch[1]) {
    avatar = decodeEscapedString(profilePicMatch[1]);
  }

  const mediaItems = [];
  const seenUrls = new Set();

  // 1) Relay JSON 내부 video_versions 배열에서 원본 동영상 추출
  const videoBlockRegex = /"video_versions":\[\{"[^}]*?"url":"((?:\\.|[^"\\])+)"/g;
  let vMatch;
  while ((vMatch = videoBlockRegex.exec(html)) !== null) {
    const videoUrl = decodeEscapedString(vMatch[1]);
    if (!seenUrls.has(videoUrl)) {
      seenUrls.add(videoUrl);
      mediaItems.push({
        type: "video",
        quality: "FHD",
        url: videoUrl,
        thumb: getMeta("og:image") || avatar
      });
    }
  }

  // 2) og:video 메타태그 폴백 추출
  const ogVideo = getMeta("og:video") || getMeta("og:video:secure_url");
  if (ogVideo && !seenUrls.has(ogVideo)) {
    seenUrls.add(ogVideo);
    mediaItems.push({
      type: "video",
      quality: "FHD",
      url: decodeEscapedString(ogVideo),
      thumb: getMeta("og:image") || avatar
    });
  }

  // 3) 동영상이 없는 게시물의 경우 고화질 이미지 추출
  if (mediaItems.length === 0) {
    const ogImage = getMeta("og:image");
    if (ogImage) {
      mediaItems.push({
        type: "image",
        quality: "HD",
        url: decodeEscapedString(ogImage),
        thumb: decodeEscapedString(ogImage)
      });
    }
  }

  if (mediaItems.length === 0) {
    throw new Error("이 게시물에서 다운로드 가능한 동영상이나 이미지를 찾을 수 없습니다.");
  }

  return {
    author: {
      name: displayName,
      handle: `@${handle}`,
      avatar: avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=27272a&color=fff`
    },
    caption: caption || "본문 내용이 없는 게시물입니다.",
    media: mediaItems
  };
}

// 1번 이미지와 동일한 작성자 카드 및 미디어 카드 렌더링
function renderThreadResult(data) {
  authorAvatar.src = data.author.avatar;
  authorAvatar.onerror = () => {
    authorAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.author.name)}&background=27272a&color=fff`;
  };
  authorName.textContent = data.author.name;
  authorHandle.textContent = data.author.handle;
  postCaption.textContent = data.caption;

  mediaList.innerHTML = "";

  data.media.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "media-card";

    const isVideo = item.type === "video";
    const typeLabel = isVideo ? "동영상" : "이미지";
    const ext = isVideo ? "mp4" : "jpg";

    card.innerHTML = `
      <div class="media-card-header">
        <span class="media-type-label">${typeLabel}</span>
        <span class="media-quality-badge">${item.quality}</span>
      </div>
      <div class="media-frame">
        ${
          isVideo
            ? `<video src="${item.url}" poster="${item.thumb || ""}" controls playsinline preload="metadata"></video>`
            : `<img src="${item.url}" alt="Threads Image" loading="lazy">`
        }
      </div>
      <button type="button" class="media-download-btn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>${typeLabel} 다운로드</span>
      </button>
    `;

    const dlBtn = card.querySelector(".media-download-btn");
    dlBtn.addEventListener("click", () => {
      downloadMediaFile(item.url, `savethreads_${Date.now()}_${index + 1}.${ext}`, dlBtn);
    });

    mediaList.appendChild(card);
  });

  resultSection.classList.remove("hidden");
}

// 프록시/Blob 기반 파일 직접 다운로드 (실패 시 새 탭 열기 폴백)
async function downloadMediaFile(fileUrl, fileName, btnElement) {
  const originalHtml = btnElement.innerHTML;
  btnElement.disabled = true;
  btnElement.textContent = "다운로드 준비 중...";

  try {
    const proxyDownloadUrl = `https://corsproxy.io/?${encodeURIComponent(fileUrl)}`;
    const res = await fetch(proxyDownloadUrl);
    if (!res.ok) throw new Error("CORS fetch failed");

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // CDN에서 프록시 다운로드를 차단한 경우 원본 미디어 새 창 열기
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  } finally {
    btnElement.disabled = false;
    btnElement.innerHTML = originalHtml;
  }
}

// 폼 제출 핸들러
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const rawUrl = urlInput.value;
  const cleanUrl = normalizeThreadsUrl(rawUrl);

  resultSection.classList.add("hidden");

  if (!cleanUrl) {
    showStatus("유효한 Threads 게시물 주소를 입력해 주세요. (예: https://www.threads.com/@user/post/...)", true);
    return;
  }

  submitBtn.disabled = true;
  showStatus("Threads 게시물에서 본문과 원본 미디어를 추출하고 있습니다...");

  try {
    // 1차: 원본 페이지 파싱, 2차: 임베드(/embed) 엔드포인트 폴백 파싱
    let html;
    try {
      html = await fetchHtmlViaProxy(`${cleanUrl}/embed`);
      if (!html.includes("video") && !html.includes("og:")) {
        html = await fetchHtmlViaProxy(cleanUrl);
      }
    } catch {
      html = await fetchHtmlViaProxy(cleanUrl);
    }

    const parsedData = parseThreadsHtml(html, cleanUrl);
    hideStatus();
    renderThreadResult(parsedData);
  } catch (err) {
    showStatus(err.message || "미디어 추출 중 오류가 발생했습니다.", true);
  } finally {
    submitBtn.disabled = false;
  }
});