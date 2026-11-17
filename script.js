// script.js

// CORS 우회 및 메타데이터 파싱을 처리할 프록시/백엔드 엔드포인트 설정
const API_ENDPOINT = ""; 

const form = document.getElementById("download-form");
const urlInput = document.getElementById("thread-url");
const pasteBtn = document.getElementById("paste-btn");
const submitBtn = document.getElementById("submit-btn");
const statusMessage = document.getElementById("status-message");
const resultSection = document.getElementById("result-section");
const mediaPreview = document.getElementById("media-preview");
const postCaption = document.getElementById("post-caption");
const downloadLinks = document.getElementById("download-links");

// Threads 게시물 URL 정규식 검증 (threads.net 및 threads.com 지원)
function isValidThreadsUrl(url) {
  const pattern = /^https?:\/\/(www\.)?threads\.(net|com)\/(@[\w.]+\/post\/|t\/)[a-zA-Z0-9_-]+/i;
  return pattern.test(url.trim());
}

function showStatus(text, type = "loading") {
  statusMessage.textContent = text;
  statusMessage.className = `status-message ${type}`;
}

function hideStatus() {
  statusMessage.className = "status-message hidden";
}

// 클립보드 원클릭 붙여넣기
pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text;
    urlInput.focus();
  } catch (err) {
    showStatus("클립보드 접근 권한이 없거나 지원되지 않는 브라우저입니다. 직접 붙여넣어 주세요.", "error");
  }
});

// Blob 변환을 통한 강제 파일 다운로드 처리
async function triggerFileDownload(fileUrl, fileName) {
  try {
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  }
}

// 추출된 미디어 카드 렌더링
function renderResult(data) {
  mediaPreview.innerHTML = "";
  downloadLinks.innerHTML = "";
  postCaption.textContent = data.caption || "Threads 미디어 게시물";

  if (data.type === "video") {
    const video = document.createElement("video");
    video.src = data.previewUrl;
    video.controls = true;
    video.playsInline = true;
    mediaPreview.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = data.previewUrl;
    img.alt = "Threads Media Preview";
    mediaPreview.appendChild(img);
  }

  data.items.forEach((item, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "download-btn";
    btn.innerHTML = `<span>${item.label}</span><span>저장 ↓</span>`;
    btn.addEventListener("click", () => {
      triggerFileDownload(item.url, `threads_${Date.now()}_${idx + 1}.${item.ext}`);
    });
    downloadLinks.appendChild(btn);
  });

  resultSection.classList.remove("hidden");
}

// 폼 제출 및 미디어 데이터 요청
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const targetUrl = urlInput.value.trim();

  resultSection.classList.add("hidden");

  if (!isValidThreadsUrl(targetUrl)) {
    showStatus("올바른 Threads 게시물 링크를 입력해 주세요. (예: https://www.threads.net/@user/post/...)", "error");
    return;
  }

  submitBtn.disabled = true;
  showStatus("게시물에서 미디어 정보를 추출하는 중입니다...", "loading");

  try {
    let mediaData;

    if (API_ENDPOINT) {
      // 실제 백엔드/Cloudflare Worker 프록시 연동 시 호출
      const res = await fetch(`${API_ENDPOINT}?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error("미디어 추출에 실패했습니다.");
      mediaData = await res.json();
    } else {
      // 정적 GitHub Pages 환경 테스트용 데모 응답
      await new Promise((r) => setTimeout(r, 700));
      mediaData = {
        type: "video",
        caption: `추출 대상 URL: ${targetUrl} (API_ENDPOINT 연결 시 실제 미디어가 표시됩니다)`,
        previewUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        items: [
          {
            label: "MP4 동영상 다운로드 (HD)",
            url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            ext: "mp4"
          }
        ]
      };
    }

    hideStatus();
    renderResult(mediaData);
  } catch (err) {
    showStatus(err.message || "미디어 추출 중 오류가 발생했습니다.", "error");
  } finally {
    submitBtn.disabled = false;
  }
});