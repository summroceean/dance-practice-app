// ⚠️ 여기에 본인의 Google Apps Script 웹 앱 배포 URL을 넣어주세요!
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwWRReORXZ1s9jVw8PMS7ZpkLuwcNKSSb4-fjZaK4R5HqJ4gbgSeuc7fY9nEJJLA387/exec";

const refVideoFile = document.getElementById('ref-video-file');
const userVideoFile = document.getElementById('user-video-file');
const userCameraFile = document.getElementById('user-camera-file');

const refDropZone = document.getElementById('ref-drop-zone');
const userDropZone = document.getElementById('user-drop-zone');

const refVideo = document.getElementById('ref-video');
const userVideo = document.getElementById('user-video');

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

// 영상 파일을 받아 화면에 표시하는 함수
function loadVideoToPlayer(file, videoElement, dropZoneElement) {
    if (!file || !file.type.startsWith('video/')) {
        alert("동영상 파일만 업로드할 수 있습니다.");
        return;
    }
    videoElement.src = URL.createObjectURL(file);
    dropZoneElement.style.display = "none";
    videoElement.style.display = "block";
}

// 드래그 앤 드롭 및 클릭 이벤트 설정
function setupDropZone(dropZone, fileInput, videoElement) {
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
            loadVideoToPlayer(e.dataTransfer.files[0], videoElement, dropZone);
        }
    });
}

setupDropZone(refDropZone, refVideoFile, refVideo);
setupDropZone(userDropZone, userVideoFile, userVideo);

refVideoFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], refVideo, refDropZone);
});

userVideoFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], userVideo, userDropZone);
});

userCameraFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], userVideo, userDropZone);
});

// 기존 곡 드롭다운 선택 시 입력창 자동 채우기
existingGroupSelect.addEventListener('change', (e) => {
    if (e.target.value) {
        groupNameInput.value = e.target.value;
    } else {
        groupNameInput.value = "";
    }
});

// 코사인 유사도 계산 (관절 중심점 정규화 포함)
function normalizeKeypoints(keypoints) {
    // 골반 중심(왼쪽 골반 11, 오른쪽 골반 12)을 기준으로 좌표 정규화하여 위치/크기 차이 보정
    const leftHip = keypoints[11];
    const rightHip = keypoints[12];
    const centerX = (leftHip.x + rightHip.x) / 2;
    const centerY = (leftHip.y + rightHip.y) / 2;

    return keypoints.flatMap(kp => [kp.x - centerX, kp.y - centerY]);
}

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

// 비디오 특정 시간으로 이동 후 프레임 로드 대기
function seekVideo(video, time) {
    return new Promise((resolve) => {
        video.currentTime = time;
        video.onseeked = () => resolve();
    });
}

// 1. 정밀 유사도 분석 실행 (전체 구간 샘플링)
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

        // 두 영상 중 짧은 길이를 기준으로 0.5초 간격 분석 (최대 15초 샘플링으로 속도 최적화)
        const duration = Math.min(refVideo.duration || 5, userVideo.duration || 5, 15);
        const step = 0.5;
        let totalSimilarity = 0;
        let validFrames = 0;

        for (let t = 0; t < duration; t += step) {
            resultBox.innerText = `영상 분석 중... (${Math.round((t / duration) * 100)}%)`;
            
            await Promise.all([
                seekVideo(refVideo, t),
                seekVideo(userVideo, t)
            ]);

            const [refPose, userPose] = await Promise.all([
                detector.estimatePoses(refVideo),
                detector.estimatePoses(userVideo)
            ]);

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

        saveStatus.innerText = `'${groupName}' (${currentScore}점) 저장 완료!`;
        setTimeout(fetchRecordsAndSetupDropdown, 1500);
    } catch (error) {
        console.error("저장 오류:", error);
        saveStatus.innerText = "저장 중 오류가 발생했습니다.";
    } finally {
        saveBtn.disabled = false;
    }
});

// 3. 구글 시트에서 기록을 불러와 드롭다운 채우기
async function fetchRecordsAndSetupDropdown() {
    if (APPS_SCRIPT_URL.includes("여기에_본인_스크립트_ID_입력")) return;

    try {
        const response = await fetch(APPS_SCRIPT_URL);
        allRecords = await response.json();

        const groups = [...new Set(allRecords.map(r => r.groupName))];

        // 그래프 조회용 드롭다운 채우기
        groupSelect.innerHTML = '<option value="">-- 곡을 선택하세요 --</option>';
        // 저장용 기존 그룹 드롭다운 채우기
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
    } catch (error) {
        console.error("기록 불러오기 실패:", error);
    }
}

// 4. 드롭다운 선택 시 꺾은선 그래프(Chart.js) 업데이트
groupSelect.addEventListener('change', (e) => {
    const selectedGroup = e.target.value;
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
});

fetchRecordsAndSetupDropdown();