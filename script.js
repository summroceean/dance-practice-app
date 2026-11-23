// ==========================================
// 0. 설정 영역 (Gemini API 키 및 구글 스프레드시트 웹 앱 URL)
// ==========================================
let GEMINI_API_KEY = ""; // 비워두면 분석 시작 시 입력창이 뜹니다.
const GEMINI_MODEL = "gemini-2.5-flash";

// 💡 여기에 구글 앱스 스크립트 배포 후 복사한 웹 앱 URL을 넣으세요!
const GOOGLE_SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxuSfqd0nchQu8v6WpXrfCfvf-Y6fDSawl3Pakd_uKfVcjJlxni_LInhLHNR70W5PJc/exec";

// DOM 요소 참조
const refYoutubeInput = document.getElementById("refYoutubeInput");
const refYoutubeBtn = document.getElementById("refYoutubeBtn");
const refYoutubeFrame = document.getElementById("refYoutubeFrame");
const refPlaceholder = document.getElementById("refPlaceholder");

const userVideoInput = document.getElementById("userVideoInput");
const userSelectBtn = document.getElementById("userSelectBtn");
const userDropZone = document.getElementById("userDropZone");
const userVideo = document.getElementById("userVideo");
const userPlaceholder = document.getElementById("userPlaceholder");

const analyzeBtn = document.getElementById("analyzeBtn");
const loadingSection = document.getElementById("loadingSection");
const loadingText = loadingSection.querySelector("p");
const resultSection = document.getElementById("resultSection");
const copyCsvBtn = document.getElementById("copyCsvBtn");

let userFile = null;
let latestResultRow = null;

// ==========================================
// 1. 유튜브 링크 불러오기 처리 (왼쪽 화면)
// ==========================================
function extractYoutubeVideoId(url) {
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

refYoutubeBtn.addEventListener("click", () => {
  const url = refYoutubeInput.value.trim();
  const videoId = extractYoutubeVideoId(url);

  if (!videoId) {
    alert("올바른 유튜브 링크를 입력해주세요.\n(예: https://www.youtube.com/watch?v=... 또는 https://youtu.be/...)");
    return;
  }

  const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`;
  refPlaceholder.style.display = "none";
  refYoutubeFrame.src = embedUrl;
  refYoutubeFrame.style.display = "block";
});

refYoutubeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") refYoutubeBtn.click();
});

// ==========================================
// 2. 사용자 연습 영상 업로드 및 드래그 앤 드롭 (오른쪽 화면)
// ==========================================
function loadUserVideoFile(file) {
  if (!file || !file.type.startsWith("video/")) {
    alert("동영상 파일(.mp4, .mov 등)만 업로드할 수 있습니다.");
    return;
  }

  userFile = file;
  const videoURL = URL.createObjectURL(file);

  userPlaceholder.style.display = "none";
  userVideo.src = videoURL;
  userVideo.style.display = "block";
  userDropZone.style.borderStyle = "solid";

  analyzeBtn.disabled = false;
}

userSelectBtn.addEventListener("click", () => userVideoInput.click());
userVideoInput.addEventListener("change", (e) => {
  if (e.target.files[0]) loadUserVideoFile(e.target.files[0]);
});

userDropZone.addEventListener("click", () => {
  if (userPlaceholder.style.display !== "none") {
    userVideoInput.click();
  }
});

userDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  userDropZone.style.borderColor = "#8b5cf6";
  userDropZone.style.backgroundColor = "rgba(139, 92, 246, 0.08)";
});

userDropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  userDropZone.style.borderColor = "#334155";
  userDropZone.style.backgroundColor = "#020617";
});

userDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  userDropZone.style.borderColor = "#334155";
  userDropZone.style.backgroundColor = "#020617";

  const droppedFile = e.dataTransfer.files[0];
  if (droppedFile) {
    loadUserVideoFile(droppedFile);
  }
});

// ==========================================
// 3. 구글 스프레드시트 자동 전송 함수
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
// 4. Gemini API 연동 및 유사도 분석 실행
// ==========================================
analyzeBtn.addEventListener("click", async () => {
  if (!userFile) return;

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
    loadingText.textContent = "1/3. 연습 영상을 Gemini 서버로 전송 중입니다...";
    const userFileInfo = await uploadToGeminiFileAPI(userFile, "user_video");

    loadingText.textContent = "2/3. 영상 프레임을 디코딩하고 분석을 준비 중입니다...";
    await waitForFileActive(userFileInfo.name);

    loadingText.textContent = "3/3. 안무 동작 및 타이밍 일치도를 채점 중입니다...";
    const aiAnalysis = await analyzeVideosWithGemini(userFileInfo);

    const fullResult = buildFinalRecord(aiAnalysis, userFile.name);
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

async function analyzeVideosWithGemini(userFileInfo) {
  const generateUrl = `https://generativelanguage.googleapis.com/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const promptText = `
당신은 전문 K-POP 및 현대무용 안무 코치입니다.
첨부된 영상은 사용자의 연습 안무 영상입니다.
이 영상의 전신 관절 각도, 동작의 크기와 선, 박자(타이밍)를 평가하여 아래 기준에 따라 한국어로 채점해주세요.

1. pose_accuracy: 관절 각도, 팔/다리 뻗기, 자세 정확도 점수 (0~100 사이 소수점 1자리)
2. timing_accuracy: 동작 전환 속도와 박자 싱크 일치도 점수 (0~100 사이 소수점 1자리)
3. total_similarity_score: 포즈 정확도(60%)와 타이밍 일치도(40%)를 반영한 종합 유사도 점수 (0~100 사이 소수점 1자리)
4. body_part_scores: 상체와 하체 각각의 점수 요약 (예: "상체 88 / 하체 81")
5. error_timestamps: 주의가 필요한 시간대 구간 (예: "0:08-0:11, 0:24")
6. feedback_summary: 연습자가 바로 고칠 수 있도록 구체적인 부위와 동작 교정 포인트를 담은 2~3문장 피드백
`;

  const requestBody = {
    contents: [
      {
        parts: [
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
// 5. 결과 데이터 결합 및 화면 출력
// ==========================================
function buildFinalRecord(aiResult, userFileName) {
  const now = new Date();
  const formattedDate = now.toISOString().replace("T", " ").substring(0, 16);
  const analysisId = "ANL-" + Math.floor(1000 + Math.random() * 9000);

  const userId = document.getElementById("userId").value.trim() || "guest_user";
  const songTitle = document.getElementById("songTitle").value.trim() || "미지정 안무";
  const refYoutubeUrl = refYoutubeInput.value.trim() || "유튜브 링크 미입력";

  return {
    analysis_id: analysisId,
    analyzed_at: formattedDate,
    user_id: userId,
    song_title: songTitle,
    reference_video_url: refYoutubeUrl,
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