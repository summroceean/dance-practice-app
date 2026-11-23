// ==========================================
// 0. 설정 영역 (Gemini API 키 및 구글 스프레드시트 웹 앱 URL)
// ==========================================
let GEMINI_API_KEY = ""; // 비워두면 분석 시작 시 입력창이 뜹니다.
const GEMINI_MODEL = "gemini-2.5-flash";

// 💡 여기에 새로 배포한 구글 앱스 스크립트 웹 앱 URL을 입력하세요!
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

// 저장 UI 요소
const saveSongSelect = document.getElementById("saveSongSelect");
const newSongInput = document.getElementById("newSongInput");
const saveRecordBtn = document.getElementById("saveRecordBtn");

// 그래프 UI 요소
const chartSongSelect = document.getElementById("chartSongSelect");
const refreshChartBtn = document.getElementById("refreshChartBtn");
const scoreHistoryCanvas = document.getElementById("scoreHistoryChart");
const chartEmptyState = document.getElementById("chartEmptyState");

let userFile = null;
let currentAnalysisRecord = null; // 현재 분석 완료된 임시 데이터
let allSheetRecords = []; // 스프레드시트에서 불러온 전체 기록 캐시
let scoreChartInstance = null; // Chart.js 인스턴스

// 페이지 로드 시 스프레드시트에서 기존 곡 목록 및 기록 불러오기
window.addEventListener("DOMContentLoaded", () => {
  fetchSheetRecordsAndPopulateUI();
});

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
// 3. Gemini API 연동 및 유사도 분석 실행
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

    // 임시 결과 객체 생성 (아직 시트에는 저장 전)
    currentAnalysisRecord = buildFinalRecord(aiAnalysis, userFile.name);
    renderResult(currentAnalysisRecord);

    // 상단 기본 곡명 칸에 미리 적어둔 값이 있다면 새 곡 입력창에 기본값으로 채워주기
    const prefilledSong = document.getElementById("songTitle").value.trim();
    if (prefilledSong) {
      saveSongSelect.value = "__NEW__";
      newSongInput.classList.remove("hidden");
      newSongInput.value = prefilledSong;
    }

    saveRecordBtn.disabled = false;
    saveRecordBtn.textContent = "기록 저장하기";

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
    if (!response.ok) throw new Error("파일 상태 확인 중 오류가 발생했습니다.");

    const fileData = await response.json();
    if (fileData.state === "ACTIVE") return fileData;
    if (fileData.state === "FAILED") throw new Error("Gemini 서버에서 비디오 처리에 실패했습니다.");

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
  if (!rawJsonText) throw new Error("Gemini로부터 유효한 분석 응답을 받지 못했습니다.");

  return JSON.parse(rawJsonText);
}

function buildFinalRecord(aiResult, userFileName) {
  const now = new Date();
  const formattedDate = now.toISOString().replace("T", " ").substring(0, 16);
  const analysisId = "ANL-" + Math.floor(1000 + Math.random() * 9000);

  const userId = document.getElementById("userId").value.trim() || "guest_user";
  const refYoutubeUrl = refYoutubeInput.value.trim() || "유튜브 링크 미입력";

  return {
    analysis_id: analysisId,
    analyzed_at: formattedDate,
    user_id: userId,
    song_title: "", // 사용자가 저장 UI에서 선택한 최종 곡 이름이 들어감
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
}

// ==========================================
// 4. 곡(무리) 선택 및 스프레드시트 저장 UI 제어
// ==========================================
// 드롭다운에서 '+ 새 곡 추가'를 고를 때만 텍스트 입력창 표시
saveSongSelect.addEventListener("change", () => {
  if (saveSongSelect.value === "__NEW__") {
    newSongInput.classList.remove("hidden");
    newSongInput.focus();
  } else {
    newSongInput.classList.add("hidden");
  }
});

// [기록 저장하기] 버튼 클릭 시 스프레드시트로 전송
saveRecordBtn.addEventListener("click", async () => {
  if (!currentAnalysisRecord) {
    alert("먼저 연습 영상을 분석해주세요.");
    return;
  }

  let selectedSongName = "";
  if (saveSongSelect.value === "__NEW__") {
    selectedSongName = newSongInput.value.trim();
    if (!selectedSongName) {
      alert("새로 추가할 곡(무리) 이름을 입력해주세요!");
      newSongInput.focus();
      return;
    }
  } else {
    selectedSongName = saveSongSelect.value;
  }

  if (GOOGLE_SHEET_WEB_APP_URL.includes("YOUR_WEB_APP_URL")) {
    alert("script.js 상단의 GOOGLE_SHEET_WEB_APP_URL에 웹 앱 주소를 먼저 입력해주세요.");
    return;
  }

  // 최종 곡 이름을 기록 객체에 반영
  currentAnalysisRecord.song_title = selectedSongName;

  saveRecordBtn.disabled = true;
  saveRecordBtn.textContent = "저장 중...";

  try {
    await fetch(GOOGLE_SHEET_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentAnalysisRecord)
    });

    saveRecordBtn.textContent = "✅ 저장 완료!";
    newSongInput.value = "";

    // 스프레드시트에 데이터가 반영될 시간을 잠시 둔 뒤 그래프 및 드롭다운 갱신
    setTimeout(async () => {
      await fetchSheetRecordsAndPopulateUI(selectedSongName);
    }, 1200);
  } catch (err) {
    console.error("스프레드시트 저장 실패:", err);
    alert("저장 중 오류가 발생했습니다.");
    saveRecordBtn.disabled = false;
    saveRecordBtn.textContent = "기록 저장하기";
  }
});

// ==========================================
// 5. 스프레드시트 기록 조회 및 Chart.js 꺾은선 그래프 렌더링
// ==========================================
async function fetchSheetRecordsAndPopulateUI(autoSelectSong = null) {
  if (GOOGLE_SHEET_WEB_APP_URL.includes("YOUR_WEB_APP_URL")) {
    chartSongSelect.innerHTML = `<option value="">웹 앱 URL 설정 필요</option>`;
    showEmptyChart("script.js에 구글 웹 앱 URL을 설정하면 저장된 곡 그래프가 표시됩니다.");
    return;
  }

  try {
    const response = await fetch(GOOGLE_SHEET_WEB_APP_URL);
    const data = await response.json();

    if (data.status !== "success") {
      throw new Error(data.message || "데이터 조회 실패");
    }

    allSheetRecords = data.records || [];

    // 중복 없는 곡(무리) 이름 목록 추출
    const uniqueSongs = [...new Set(
      allSheetRecords
        .map((r) => r.song_title)
        .filter((title) => title && title !== "미지정 안무" && title !== "미지정 곡")
    )];

    updateDropdownMenus(uniqueSongs, autoSelectSong);
  } catch (err) {
    console.error("시트 데이터 조회 오류:", err);
    chartSongSelect.innerHTML = `<option value="">데이터 불러오기 실패</option>`;
  }
}

function updateDropdownMenus(uniqueSongs, autoSelectSong) {
  // 1) 저장용 드롭다운 채우기 (기존 곡 목록 + 맨 아래 '+ 새 곡 추가')
  saveSongSelect.innerHTML = "";
  uniqueSongs.forEach((song) => {
    const opt = document.createElement("option");
    opt.value = song;
    opt.textContent = `📁 ${song}`;
    saveSongSelect.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = "__NEW__";
  newOpt.textContent = "+ 새 곡 추가 (직접 입력)";
  saveSongSelect.appendChild(newOpt);

  // 기존 곡이 하나라도 있으면 첫 번째 곡(또는 방금 저장한 곡) 선택 상태로 두고 입력창 숨기기
  if (autoSelectSong && uniqueSongs.includes(autoSelectSong)) {
    saveSongSelect.value = autoSelectSong;
    newSongInput.classList.add("hidden");
  } else if (uniqueSongs.length > 0) {
    saveSongSelect.value = uniqueSongs[0];
    newSongInput.classList.add("hidden");
  } else {
    saveSongSelect.value = "__NEW__";
    newSongInput.classList.remove("hidden");
  }

  // 2) 그래프 조회용 드롭다운 채우기
  chartSongSelect.innerHTML = "";
  if (uniqueSongs.length === 0) {
    chartSongSelect.innerHTML = `<option value="">저장된 곡 기록이 없습니다</option>`;
    showEmptyChart("아직 저장된 연습 기록이 없습니다. 영상을 분석하고 첫 기록을 저장해보세요!");
    return;
  }

  uniqueSongs.forEach((song) => {
    const opt = document.createElement("option");
    opt.value = song;
    opt.textContent = song;
    chartSongSelect.appendChild(opt);
  });

  const targetSongForChart = (autoSelectSong && uniqueSongs.includes(autoSelectSong))
    ? autoSelectSong
    : uniqueSongs[0];

  chartSongSelect.value = targetSongForChart;
  renderSongProgressChart(targetSongForChart);
}

// 그래프 드롭다운에서 다른 곡을 고를 때 그래프 다시 그리기
chartSongSelect.addEventListener("change", () => {
  const selected = chartSongSelect.value;
  if (selected) {
    renderSongProgressChart(selected);
  }
});

refreshChartBtn.addEventListener("click", () => {
  fetchSheetRecordsAndPopulateUI(chartSongSelect.value);
});

function showEmptyChart(message) {
  if (scoreChartInstance) {
    scoreChartInstance.destroy();
    scoreChartInstance = null;
  }
  scoreHistoryCanvas.style.display = "none";
  chartEmptyState.textContent = message;
  chartEmptyState.classList.remove("hidden");
}

function renderSongProgressChart(songName) {
  // 선택한 곡의 기록만 필터링
  const filtered = allSheetRecords.filter((r) => r.song_title === songName);

  if (filtered.length === 0) {
    showEmptyChart(`'${songName}' 곡에 대한 연습 기록이 없습니다.`);
    return;
  }

  chartEmptyState.classList.add("hidden");
  scoreHistoryCanvas.style.display = "block";

  // X축: 날짜(타임스탬프), Y축: 종합 유사도, 포즈 정확도, 타이밍 일치도
  const labels = filtered.map((r, idx) => `${idx + 1}회차 (${r.analyzed_at})`);
  const totalScores = filtered.map((r) => r.total_similarity_score);
  const poseScores = filtered.map((r) => r.pose_accuracy);
  const timingScores = filtered.map((r) => r.timing_accuracy);

  if (scoreChartInstance) {
    scoreChartInstance.destroy();
  }

  const ctx = scoreHistoryCanvas.getContext("2d");
  scoreChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "종합 유사도 (%)",
          data: totalScores,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.2)",
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: "#c4b5fd",
          tension: 0.25,
          fill: true
        },
        {
          label: "포즈 정확도 (%)",
          data: poseScores,
          borderColor: "#38bdf8",
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 4,
          tension: 0.25
        },
        {
          label: "타이밍 일치도 (%)",
          data: timingScores,
          borderColor: "#34d399",
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 4,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { color: "#94a3b8" },
          grid: { color: "#1e293b" }
        },
        x: {
          ticks: { color: "#94a3b8", maxRotation: 15 },
          grid: { color: "#1e293b" }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#f8fafc", font: { size: 12 } }
        },
        tooltip: {
          mode: "index",
          intersect: false
        }
      }
    }
  });
}