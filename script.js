// ==========================================
// 0. 설정 영역 (Gemini API 키 및 구글 스프레드시트 웹 앱 URL)
// ==========================================
let GEMINI_API_KEY = ""; // 비워두면 분석 시작 시 입력창이 뜹니다.
const GEMINI_MODEL = "gemini-2.5-flash";

// 구글 앱스 스크립트 배포 후 복사한 웹 앱 URL을 입력하세요
const GOOGLE_SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxuSfqd0nchQu8v6WpXrfCfvf-Y6fDSawl3Pakd_uKfVcjJlxni_LInhLHNR70W5PJc/exec";

// DOM 요소 참조
const refVideoInput = document.getElementById("refVideoInput");
const userVideoInput = document.getElementById("userVideoInput");
const refSelectBtn = document.getElementById("refSelectBtn");
const userSelectBtn = document.getElementById("userSelectBtn");

const refDropZone = document.getElementById("refDropZone");
const userDropZone = document.getElementById("userDropZone");

const refVideo = document.getElementById("refVideo");
const userVideo = document.getElementById("userVideo");
const refYoutubeFrame = document.getElementById("refYoutubeFrame");
const userYoutubeFrame = document.getElementById("userYoutubeFrame");
const refPlaceholder = document.getElementById("refPlaceholder");
const userPlaceholder = document.getElementById("userPlaceholder");

const refYoutubeInput = document.getElementById("refYoutubeInput");
const refYoutubeBtn = document.getElementById("refYoutubeBtn");
const userYoutubeInput = document.getElementById("userYoutubeInput");
const userYoutubeBtn = document.getElementById("userYoutubeBtn");

const syncPlayBtn = document.getElementById("syncPlayBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const loadingSection = document.getElementById("loadingSection");
const loadingText = loadingSection.querySelector("p");
const resultSection = document.getElementById("resultSection");
const copyCsvBtn = document.getElementById("copyCsvBtn");

// 상태 관리 (파일 업로드 여부 vs 유튜브 로드 여부)
let state = {
  refFile: null,
  userFile: null,
  refIsYoutube: false,
  userIsYoutube: false
};
let latestResultRow = null;

// ==========================================
// 1. 로컬 파일 업로드 및 스마트폰 촬영 처리
// ==========================================
function loadLocalVideoFile(file, type) {
  if (!file || !file.type.startsWith("video/")) {
    alert("동영상 파일(.mp4, .mov 등)만 업로드할 수 있습니다.");
    return;
  }

  const videoURL = URL.createObjectURL(file);

  if (type === "ref") {
    state.refFile = file;
    state.refIsYoutube = false;
    refYoutubeFrame.style.display = "none";
    refYoutubeFrame.src = "";
    refPlaceholder.style.display = "none";
    refVideo.src = videoURL;
    refVideo.style.display = "block";
    refDropZone.style.borderStyle = "solid";
  } else {
    state.userFile = file;
    state.userIsYoutube = false;
    userYoutubeFrame.style.display = "none";
    userYoutubeFrame.src = "";
    userPlaceholder.style.display = "none";
    userVideo.src = videoURL;
    userVideo.style.display = "block";
    userDropZone.style.borderStyle = "solid";
  }

  updateButtonStates();
}

// 버튼 클릭 시 숨겨진 파일 입력창 실행 (모바일에서는 카메라/갤러리 선택창 오픈)
refSelectBtn.addEventListener("click", () => refVideoInput.click());
userSelectBtn.addEventListener("click", () => userVideoInput.click());

refVideoInput.addEventListener("change", (e) => {
  if (e.target.files[0]) loadLocalVideoFile(e.target.files[0], "ref");
});
userVideoInput.addEventListener("change", (e) => {
  if (e.target.files[0]) loadLocalVideoFile(e.target.files[0], "user");
});

// ==========================================
// 2. 드래그 앤 드롭 박스 이벤트 설정
// ==========================================
function setupDropZone(dropZoneElement, inputElement, type) {
  // 빈 영역 클릭 시에도 파일 선택창 열기 (비디오 재생 중 클릭과 겹치지 않도록 placeholder 보일 때만)
  dropZoneElement.addEventListener("click", () => {
    const placeholder = type === "ref" ? refPlaceholder : userPlaceholder;
    if (placeholder.style.display !== "none") {
      inputElement.click();
    }
  });

  dropZoneElement.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZoneElement.style.borderColor = "#8b5cf6";
    dropZoneElement.style.backgroundColor = "rgba(139, 92, 246, 0.08)";
  });

  dropZoneElement.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropZoneElement.style.borderColor = "#334155";
    dropZoneElement.style.backgroundColor = "#020617";
  });

  dropZoneElement.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZoneElement.style.borderColor = "#334155";
    dropZoneElement.style.backgroundColor = "#020617";

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      loadLocalVideoFile(droppedFile, type);
    }
  });
}

setupDropZone(refDropZone, refVideoInput, "ref");
setupDropZone(userDropZone, userVideoInput, "user");

// ==========================================
// 3. 유튜브 링크 파싱 및 임베드 재생 처리
// ==========================================
function extractYoutubeVideoId(url) {
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

function loadYoutubeVideo(urlInput, type) {
  const url = urlInput.value.trim();
  const videoId = extractYoutubeVideoId(url);

  if (!videoId) {
    alert("올바른 유튜브 링크를 입력해주세요.\n(예: https://www.youtube.com/watch?v=... 또는 https://youtu.be/...)");
    return;
  }

  const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`;

  if (type === "ref") {
    state.refFile = null;
    state.refIsYoutube = true;
    refVideo.pause();
    refVideo.style.display = "none";
    refVideo.src = "";
    refPlaceholder.style.display = "none";
    refYoutubeFrame.src = embedUrl;
    refYoutubeFrame.style.display = "block";
    refDropZone.style.borderStyle = "solid";
  } else {
    state.userFile = null;
    state.userIsYoutube = true;
    userVideo.pause();
    userVideo.style.display = "none";
    userVideo.src = "";
    userPlaceholder.style.display = "none";
    userYoutubeFrame.src = embedUrl;
    userYoutubeFrame.style.display = "block";
    userDropZone.style.borderStyle = "solid";
  }

  updateButtonStates();
}

refYoutubeBtn.addEventListener("click", () => loadYoutubeVideo(refYoutubeInput, "ref"));
userYoutubeBtn.addEventListener("click", () => loadYoutubeVideo(userYoutubeInput, "user"));

// 엔터키로도 유튜브 링크 바로 불러오기
refYoutubeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadYoutubeVideo(refYoutubeInput, "ref");
});
userYoutubeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadYoutubeVideo(userYoutubeInput, "user");
});

// ==========================================
// 4. 버튼 활성화 및 로컬 영상 동시 재생 제어
// ==========================================
function updateButtonStates() {
  const bothFilesReady = Boolean(state.refFile && state.userFile);
  const bothMediaReady = (Boolean(state.refFile) || state.refIsYoutube) && (Boolean(state.userFile) || state.userIsYoutube);

  // 동시 재생 버튼: 두 영상 모두 로컬 파일일 때 정확히 동기화 제어 가능
  syncPlayBtn.disabled = !bothFilesReady;

  // 유사도 분석 버튼: 두 영상 중 하나라도 준비되면 활성화 (유튜브 포함 시 안내 메시지 출력)
  analyzeBtn.disabled = !bothMediaReady;
}

syncPlayBtn.addEventListener("click", () => {
  if (!state.refFile || !state.userFile) return;

  if (refVideo.paused || userVideo.paused) {
    const targetTime = Math.min(refVideo.currentTime, userVideo.currentTime);
    refVideo.currentTime = targetTime;
    userVideo.currentTime = targetTime;

    refVideo.play();
    userVideo.play();
  } else {
    refVideo.pause();
    userVideo.pause();
  }
});

// ==========================================
// 5. 구글 스프레드시트 자동 저장 함수
// ==========================================
async function saveResultToGoogleSheet(resultData) {
  if (GOOGLE_SHEET_WEB_APP_URL.includes("YOUR_WEB_APP_URL")) {
    console.warn("웹 앱 URL이 설정되지 않아 스프레드시트 저장을 건너뜁니다.");
    return;
  }

  try {
    await fetch(GOOGLE_SHEET_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resultData)
    });
    console.log("구글 스프레드시트 전송 요청 완료");
  } catch (err) {
    console.error("구글 스프레드시트 전송 실패:", err);
  }
}

// ==========================================
// 6. Gemini API 연동 및 영상 유사도 분석 실행
// ==========================================
analyzeBtn.addEventListener("click", async () => {
  if (state.refIsYoutube || state.userIsYoutube) {
    alert(
      "유튜브 링크 영상은 화면에서 재생하며 육안으로 비교할 수 있습니다.\n\n" +
      "AI 자동 점수 채점(Gemini 분석)을 실행하려면 기준 영상과 연습 영상 모두 동영상 파일(.mp4, .mov 등)로 업로드해 주세요!"
    );
    return;
  }

  if (!state.refFile || !state.userFile) return;

  if (!GEMINI_API_KEY) {
    const inputKey = prompt("분석을 위해 Gemini API 키를 입력해주세요 (AI Studio에서 발급):");
    if (!inputKey || !inputKey.trim()) {
      alert("API 키가 입력되지 않아 분석을 취소합니다.");
      return;
    }
    GEMINI_API_KEY = inputKey.trim();
  }

  resultSection.classList.add("hidden");
  loadingSection.classList.remove("hidden");
  analyzeBtn.disabled = true;

  try {
    loadingText.textContent = "1/3. 기준 영상과 연습 영상을 Gemini 서버로 전송 중입니다...";
    const [refFileInfo, userFileInfo] = await Promise.all([
      uploadToGeminiFileAPI(state.refFile, "reference_video"),
      uploadToGeminiFileAPI(state.userFile, "user_video")
    ]);

    loadingText.textContent = "2/3. 영상 프레임을 디코딩하고 관절 움직임을 추출 중입니다...";
    await Promise.all([
      waitForFileActive(refFileInfo.name),
      waitForFileActive(userFileInfo.name)
    ]);

    loadingText.textContent = "3/3. 안무 동작 각도 및 타이밍 유사도를 채점 중입니다...";
    const aiAnalysis = await analyzeVideosWithGemini(refFileInfo, userFileInfo);

    const fullResult = buildFinalRecord(aiAnalysis, state.refFile.name, state.userFile.name);
    renderResult(fullResult);
    saveResultToGoogleSheet(fullResult);

    loadingSection.classList.add("hidden");
    resultSection.classList.remove("hidden");
  } catch (error) {
    console.error("Gemini 분석 오류:", error);
    alert(`영상 분석 중 오류가 발생했습니다:\n${error.message}`);
    loadingSection.classList.add("hidden");
  } finally {
    analyzeBtn.disabled = false;
  }
});

async function uploadToGeminiFileAPI(file, displayName) {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-Header-Content-Length": file.size,
      "X-Goog-Upload-Header-Content-Type": file.type || "video/mp4",
      "Content-Type": file.type || "video/mp4"
    },
    body: file
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`파일 업로드 실패 (${displayName}): ${errText}`);
  }

  const data = await response.json();
  return data.file;
}

async function waitForFileActive(fileName) {
  const checkUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`;

  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(checkUrl);
    if (!response.ok) {
      throw new Error("파일 상태 확인 중 오류가 발생했습니다.");
    }

    const fileData = await response.json();
    if (fileData.state === "ACTIVE") return fileData;
    if (fileData.state === "FAILED") {
      throw new Error("Gemini 서버에서 비디오 처리에 실패했습니다.");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("비디오 처리 대기 시간이 초과되었습니다.");
}

async function analyzeVideosWithGemini(refFileInfo, userFileInfo) {
  const generateUrl = `https://generativelanguage.googleapis.com/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const promptText = `
당신은 전문 K-POP 및 현대무용 안무 코치입니다.
첫 번째 첨부 영상은 [기준 영상(원본 안무)]이고, 두 번째 첨부 영상은 [사용자 영상(연습 영상)]입니다.
두 영상의 전신 관절 각도, 동작의 크기와 선, 박자(타이밍) 일치도를 정밀하게 비교 분석하여 아래 기준에 따라 한국어로 평가해주세요.

1. pose_accuracy: 관절 각도, 팔/다리 뻗기, 자세 정확도 점수 (0~100 사이 소수점 1자리)
2. timing_accuracy: 동작 전환 속도와 박자 싱크 일치도 점수 (0~100 사이 소수점 1자리)
3. total_similarity_score: 포즈 정확도(60%)와 타이밍 일치도(40%)를 반영한 종합 유사도 점수 (0~100 사이 소수점 1자리)
4. body_part_scores: 상체와 하체 각각의 점수 요약 (예: "상체 88 / 하체 81")
5. error_timestamps: 기준 영상과 차이가 가장 컸던 시간대 구간 (예: "0:08-0:11, 0:24")
6. feedback_summary: 연습자가 바로 고칠 수 있도록 구체적인 부위와 동작 교정 포인트를 담은 2~3문장 피드백
`;

  const requestBody = {
    contents: [
      {
        parts: [
          { file_data: { mime_type: refFileInfo.mimeType, file_uri: refFileInfo.uri } },
          { file_data: { mime_type: userFileInfo.mimeType, file_uri: userFileInfo.uri } },
          { text: promptText }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          total_similarity_score: { type: "NUMBER" },
          pose_accuracy: { type: "NUMBER" },
          timing_accuracy: { type: "NUMBER" },
          body_part_scores: { type: "STRING" },
          error_timestamps: { type: "STRING" },
          feedback_summary: { type: "STRING" }
        },
        required: [
          "total_similarity_score",
          "pose_accuracy",
          "timing_accuracy",
          "body_part_scores",
          "error_timestamps",
          "feedback_summary"
        ]
      }
    }
  };

  const response = await fetch(generateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini 분석 요청 실패: ${errText}`);
  }

  const data = await response.json();
  const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawJsonText) {
    throw new Error("Gemini로부터 유효한 분석 응답을 받지 못했습니다.");
  }

  return JSON.parse(rawJsonText);
}

// ==========================================
// 7. 결과 데이터 결합 및 화면 출력
// ==========================================
function buildFinalRecord(aiResult, refFileName, userFileName) {
  const now = new Date();
  const formattedDate = now.toISOString().replace("T", " ").substring(0, 16);
  const analysisId = "ANL-" + Math.floor(1000 + Math.random() * 9000);

  const userId = document.getElementById("userId").value.trim() || "guest_user";
  const songTitle = document.getElementById("songTitle").value.trim() || "미지정 안무";

  return {
    analysis_id: analysisId,
    analyzed_at: formattedDate,
    user_id: userId,
    song_title: songTitle,
    reference_video_url: refFileName,
    user_video_url: userFileName,
    total_similarity_score: Number(aiResult.total_similarity_score).toFixed(1),
    pose_accuracy: Number(aiResult.pose_accuracy).toFixed(1),
    timing_accuracy: Number(aiResult.timing_accuracy).toFixed(1),
    body_part_scores: aiResult.body_part_scores,
    error_timestamps: aiResult.error_timestamps,
    feedback_summary: aiResult.feedback_summary
  };
}

function renderResult(data) {
  document.getElementById("totalScore").textContent = `${data.total_similarity_score}%`;
  document.getElementById("poseScore").textContent = `${data.pose_accuracy}%`;
  document.getElementById("timingScore").textContent = `${data.timing_accuracy}%`;

  document.getElementById("analysisId").textContent = data.analysis_id;
  document.getElementById("analyzedAt").textContent = data.analyzed_at;
  document.getElementById("bodyPartScores").textContent = data.body_part_scores;
  document.getElementById("errorTimestamps").textContent = data.error_timestamps;
  document.getElementById("feedbackSummary").textContent = data.feedback_summary;

  latestResultRow = [
    data.analysis_id,
    data.analyzed_at,
    data.user_id,
    data.song_title,
    data.reference_video_url,
    data.user_video_url,
    data.total_similarity_score,
    data.pose_accuracy,
    data.timing_accuracy,
    data.body_part_scores,
    data.error_timestamps,
    data.feedback_summary
  ].join("\t");
}

copyCsvBtn.addEventListener("click", () => {
  if (!latestResultRow) return;

  navigator.clipboard.writeText(latestResultRow).then(() => {
    const originalText = copyCsvBtn.textContent;
    copyCsvBtn.textContent = "✅ 복사 완료! 시트에 Ctrl+V로 붙여넣으세요";
    setTimeout(() => {
      copyCsvBtn.textContent = originalText;
    }, 2500);
  });
});