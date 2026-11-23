// ⚠️ 여기에 본인의 Google Apps Script 웹 앱 배포 URL을 넣어주세요!
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwWRReORXZ1s9jVw8PMS7ZpkLuwcNKSSb4-fjZaK4R5HqJ4gbgSeuc7fY9nEJJLA387/exec";

// 탭 전환 로직
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');

        if (targetId === 'tab-graph') {
            fetchRecordsAndSetupDropdown();
        }
    });
});

const refVideoFile = document.getElementById('ref-video-file');
const userVideoFile = document.getElementById('user-video-file');
const userCameraFile = document.getElementById('user-camera-file');

const refDropZone = document.getElementById('ref-drop-zone');
const userDropZone = document.getElementById('user-drop-zone');

const refVideoWrapper = document.getElementById('ref-video-wrapper');
const userVideoWrapper = document.getElementById('user-video-wrapper');

const refVideo = document.getElementById('ref-video');
const userVideo = document.getElementById('user-video');

const refCanvas = document.getElementById('ref-canvas');
const userCanvas = document.getElementById('user-canvas');

const analyzeBtn = document.getElementById('analyze-btn');
const resultBox = document.getElementById('result-box');

const savePanel = document.getElementById('save-panel');
const existingGroupSelect = document.getElementById('existing-group-select');
const groupNameInput = document.getElementById('group-name-input');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

const groupSelect = document.getElementById('group-select');
const ctx = document.getElementById('scoreChart').getContext('2d');

let currentScore = null;
let allRecords = [];
let scoreChart = null;

// MoveNet 17개 관절 연결 쌍 (뼈대 선 그리기용)
const CONNECTED_KEYPOINTS = [
    [5, 6],   // 왼쪽 어깨 - 오른쪽 어깨
    [5, 7],   // 왼쪽 어깨 - 왼쪽 팔꿈치
    [7, 9],   // 왼쪽 팔꿈치 - 왼쪽 손목
    [6, 8],   // 오른쪽 어깨 - 오른쪽 팔꿈치
    [8, 10],  // 오른쪽 팔꿈치 - 오른쪽 손목
    [5, 11],  // 왼쪽 어깨 - 왼쪽 골반
    [6, 12],  // 오른쪽 어깨 - 오른쪽 골반
    [11, 12], // 왼쪽 골반 - 오른쪽 골반
    [11, 13], // 왼쪽 골반 - 왼쪽 무릎
    [13, 15], // 왼쪽 무릎 - 왼쪽 발목
    [12, 14], // 오른쪽 골반 - 오른쪽 무릎
    [14, 16]  // 오른쪽 무릎 - 오른쪽 발목
];

// 영상 위에 관절 포인트와 뼈대 선을 그리는 함수
function drawSkeleton(keypoints, videoElement, canvasElement, lineColor, pointColor) {
    const canvasCtx = canvasElement.getContext('2d');
    
    // 비디오 원본 해상도에 맞춰 캔버스 내부 해상도 동기화
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    const minConfidence = 0.3;

    // 1. 뼈대 선 그리기
    canvasCtx.strokeStyle = lineColor;
    canvasCtx.lineWidth = Math.max(3, canvasElement.width / 160);
    canvasCtx.lineCap = 'round';

    CONNECTED_KEYPOINTS.forEach(([i, j]) => {
        const kp1 = keypoints[i];
        const kp2 = keypoints[j];
        if (kp1 && kp2 && kp1.score > minConfidence && kp2.score > minConfidence) {
            canvasCtx.beginPath();
            canvasCtx.moveTo(kp1.x, kp1.y);
            canvasCtx.lineTo(kp2.x, kp2.y);
            canvasCtx.stroke();
        }
    });

    // 2. 관절 포인트 원 그리기
    canvasCtx.fillStyle = pointColor;
    const radius = Math.max(4, canvasElement.width / 110);

    keypoints.forEach(kp => {
        if (kp.score > minConfidence) {
            canvasCtx.beginPath();
            canvasCtx.arc(kp.x, kp.y, radius, 0, 2 * Math.PI);
            canvasCtx.fill();
        }
    });
}

// 캔버스 초기화 함수
function clearCanvas(canvasElement) {
    const canvasCtx = canvasElement.getContext('2d');
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

// 영상 파일을 받아 빈 칸(드롭존)을 숨기고 비디오 래퍼를 띄우는 함수
function loadVideoToPlayer(file, videoElement, dropZoneElement, wrapperElement, canvasElement) {
    if (!file || !file.type.startsWith('video/')) {
        alert("동영상 파일만 업로드할 수 있습니다.");
        return;
    }
    videoElement.src = URL.createObjectURL(file);
    dropZoneElement.style.display = "none";
    wrapperElement.style.display = "block";
    clearCanvas(canvasElement);
}

// 드래그 앤 드롭 및 클릭 이벤트 설정
function setupDropZone(dropZone, fileInput, videoElement, wrapperElement, canvasElement) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            loadVideoToPlayer(e.dataTransfer.files[0], videoElement, dropZone, wrapperElement, canvasElement);
        }
    });
}

setupDropZone(refDropZone, refVideoFile, refVideo, refVideoWrapper, refCanvas);
setupDropZone(userDropZone, userVideoFile, userVideo, userVideoWrapper, userCanvas);

refVideoFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], refVideo, refDropZone, refVideoWrapper, refCanvas);
});

userVideoFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], userVideo, userDropZone, userVideoWrapper, userCanvas);
});

userCameraFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], userVideo, userDropZone, userVideoWrapper, userCanvas);
});

// 사용자가 영상을 직접 재생할 때는 캔버스 뼈대 지우기
refVideo.addEventListener('play', () => clearCanvas(refCanvas));
userVideo.addEventListener('play', () => clearCanvas(userCanvas));

existingGroupSelect.addEventListener('change', (e) => {
    groupNameInput.value = e.target.value ? e.target.value : "";
});

// 관절 좌표 중심점 정규화
function normalizeKeypoints(keypoints) {
    const leftHip = keypoints[11];
    const rightHip = keypoints[12];
    const centerX = (leftHip.x + rightHip.x) / 2;
    const centerY = (leftHip.y + rightHip.y) / 2;

    return keypoints.flatMap(kp => [kp.x - centerX, kp.y - centerY]);
}

// 코사인 유사도 계산
function calculateCosineSimilarity(vectorA, vectorB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vectorA.length; i++) {
        dotProduct += vectorA[i] * vectorB[i];
        normA += vectorA[i] * vectorA[i];
        normB += vectorB[i] * vectorB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function seekVideo(video, time) {
    return new Promise((resolve) => {
        video.currentTime = time;
        video.onseeked = () => resolve();
    });
}

// 1. 유사도 분석 실행 (관절 뼈대 실시간 오버레이 포함)
analyzeBtn.addEventListener('click', async () => {
    if (!refVideo.src || !userVideo.src) {
        alert("원본 영상과 내 연습 영상 파일을 모두 업로드해주세요!");
        return;
    }

    resultBox.innerText = "AI 모델 로딩 중...";
    analyzeBtn.disabled = true;
    savePanel.style.display = "none";
    saveStatus.innerText = "";

    try {
        const detectorConfig = { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
        const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, detectorConfig);

        const duration = Math.min(refVideo.duration || 5, userVideo.duration || 5, 15);
        const step = 0.5;
        let totalSimilarity = 0;
        let validFrames = 0;

        for (let t = 0; t < duration; t += step) {
            resultBox.innerText = `관절 추적 및 분석 중... (${Math.round((t / duration) * 100)}%)`;
            
            await Promise.all([
                seekVideo(refVideo, t),
                seekVideo(userVideo, t)
            ]);

            const [refPose, userPose] = await Promise.all([
                detector.estimatePoses(refVideo),
                detector.estimatePoses(userVideo)
            ]);

            // 원본 영상 위에 보라색 뼈대 그리기
            if (refPose.length > 0) {
                drawSkeleton(refPose[0].keypoints, refVideo, refCanvas, '#a78bfa', '#f472b6');
            } else {
                clearCanvas(refCanvas);
            }

            // 내 영상 위에 에메랄드빛 뼈대 그리기
            if (userPose.length > 0) {
                drawSkeleton(userPose[0].keypoints, userVideo, userCanvas, '#34d399', '#fbbf24');
            } else {
                clearCanvas(userCanvas);
            }

            if (refPose.length > 0 && userPose.length > 0) {
                const refVector = normalizeKeypoints(refPose[0].keypoints);
                const userVector = normalizeKeypoints(userPose[0].keypoints);
                const sim = calculateCosineSimilarity(refVector, userVector);
                
                if (sim > 0) {
                    totalSimilarity += sim;
                    validFrames++;
                }
            }
        }

        if (validFrames > 0) {
            const avgSimilarity = totalSimilarity / validFrames;
            currentScore = Math.max(0, Math.min(100, Math.round(avgSimilarity * 100)));
            
            resultBox.innerText = `분석 완료! 유사도 점수: ${currentScore}점`;
            savePanel.style.display = "block";
        } else {
            resultBox.innerText = "영상 속 인물을 감지하지 못했습니다. 전신이 잘 보이는 영상으로 다시 시도해 주세요.";
        }

    } catch (error) {
        console.error(error);
        resultBox.innerText = "분석 중 오류가 발생했습니다. 브라우저를 새로고침 후 다시 시도해주세요.";
    } finally {
        analyzeBtn.disabled = false;
    }
});

// 2. 구글 스프레드시트에 점수 저장
saveBtn.addEventListener('click', async () => {
    const groupName = groupNameInput.value.trim();

    if (!groupName) {
        alert("곡(그룹) 이름을 선택하거나 입력해주세요!");
        return;
    }

    if (currentScore === null) {
        alert("먼저 유사도 분석을 완료해주세요.");
        return;
    }

    saveBtn.disabled = true;
    saveStatus.innerText = "구글 스프레드시트에 저장 중...";

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ groupName: groupName, score: currentScore })
        });

        saveStatus.innerText = `'${groupName}' (${currentScore}점) 저장 완료! 상단 '성장 기록 그래프' 탭에서 확인하세요.`;
        setTimeout(fetchRecordsAndSetupDropdown, 1500);
    } catch (error) {
        console.error("저장 오류:", error);
        saveStatus.innerText = "저장 중 오류가 발생했습니다.";
    } finally {
        saveBtn.disabled = false;
    }
});

// 3. 구글 시트에서 기록 불러오기
async function fetchRecordsAndSetupDropdown() {
    if (APPS_SCRIPT_URL.includes("여기에_본인_스크립트_ID_입력")) return;

    try {
        const response = await fetch(APPS_SCRIPT_URL);
        allRecords = await response.json();

        const groups = [...new Set(allRecords.map(r => r.groupName))];
        const previousSelection = groupSelect.value;

        groupSelect.innerHTML = '<option value="">-- 곡을 선택하세요 --</option>';
        existingGroupSelect.innerHTML = '<option value="">-- 새 곡(그룹) 직접 입력 --</option>';

        groups.forEach(g => {
            const opt1 = document.createElement('option');
            opt1.value = g;
            opt1.textContent = g;
            groupSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = g;
            opt2.textContent = g;
            existingGroupSelect.appendChild(opt2);
        });

        if (previousSelection && groups.includes(previousSelection)) {
            groupSelect.value = previousSelection;
            renderChart(previousSelection);
        }
    } catch (error) {
        console.error("기록 불러오기 실패:", error);
    }
}

// 4. 꺾은선 그래프(Chart.js) 그리기
function renderChart(selectedGroup) {
    const filtered = allRecords.filter(r => r.groupName === selectedGroup);

    const labels = filtered.map(r => r.date);
    const scores = filtered.map(r => r.score);

    if (scoreChart) {
        scoreChart.destroy();
    }

    scoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${selectedGroup} 유사도 점수`,
                data: scores,
                borderColor: '#a78bfa',
                backgroundColor: 'rgba(167, 139, 250, 0.2)',
                borderWidth: 2,
                pointBackgroundColor: '#8b5cf6',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#e2e8f0' } }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#1e293b' }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                }
            }
        }
    });
}

groupSelect.addEventListener('change', (e) => {
    renderChart(e.target.value);
});

fetchRecordsAndSetupDropdown();