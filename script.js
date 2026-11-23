// ⚠️ 본인의 Google Apps Script 웹 앱 배포 URL을 입력하세요!
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySCw2nGHDzxt8EUgAf3jqalpBCYVgxr8Y9AXjlZyq_l1UKvJEn39LowVNZWk8g-Sev/exec";

// 탭 전환
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

const refDeleteBtn = document.getElementById('ref-delete-btn');
const userDeleteBtn = document.getElementById('user-delete-btn');

const refDropZone = document.getElementById('ref-drop-zone');
const userDropZone = document.getElementById('user-drop-zone');

const refVideoWrapper = document.getElementById('ref-video-wrapper');
const userVideoWrapper = document.getElementById('user-video-wrapper');

const refVideo = document.getElementById('ref-video');
const userVideo = document.getElementById('user-video');

const refCanvas = document.getElementById('ref-canvas');
const userCanvas = document.getElementById('user-canvas');

const analyzeBtn = document.getElementById('analyze-btn');
const statusBox = document.getElementById('status-box');

const reportPanel = document.getElementById('report-panel');
const scoreTotalEl = document.getElementById('score-total');
const gradeBadgeEl = document.getElementById('grade-badge');
const scoreHandEl = document.getElementById('score-hand');
const scoreFootEl = document.getElementById('score-foot');
const scoreRhythmEl = document.getElementById('score-rhythm');
const scoreFaceEl = document.getElementById('score-face');
const barHandEl = document.getElementById('bar-hand');
const barFootEl = document.getElementById('bar-foot');
const barRhythmEl = document.getElementById('bar-rhythm');
const barFaceEl = document.getElementById('bar-face');
const adviceListEl = document.getElementById('advice-list');

const savePanel = document.getElementById('save-panel');
const existingGroupSelect = document.getElementById('existing-group-select');
const groupNameInput = document.getElementById('group-name-input');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

const groupSelect = document.getElementById('group-select');
const groupManageActions = document.getElementById('group-manage-actions');
const renameGroupBtn = document.getElementById('rename-group-btn');
const deleteGroupBtn = document.getElementById('delete-group-btn');
const metricToggles = document.querySelectorAll('.metric-toggle');
const ctx = document.getElementById('scoreChart').getContext('2d');

let latestScores = null;
let allRecords = [];
let scoreChart = null;

// MoveNet 17개 관절 연결 쌍 (얼굴 포함)
const CONNECTED_KEYPOINTS = [
    [0, 1], [0, 2], [1, 3], [2, 4],       // 얼굴(코-눈-귀)
    [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // 상체 및 팔
    [5, 11], [6, 12], [11, 12],           // 몸통
    [11, 13], [13, 15], [12, 14], [14, 16] // 하체 및 발
];

function drawSkeleton(keypoints, videoElement, canvasElement, lineColor, pointColor) {
    const canvasCtx = canvasElement.getContext('2d');
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    const minConfidence = 0.35;
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

function clearCanvas(canvasElement) {
    const canvasCtx = canvasElement.getContext('2d');
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

function loadVideoToPlayer(file, videoElement, dropZoneElement, wrapperElement, canvasElement, deleteBtnElement) {
    if (!file || !file.type.startsWith('video/')) {
        alert("동영상 파일만 업로드할 수 있습니다.");
        return;
    }
    if (videoElement.src) URL.revokeObjectURL(videoElement.src);
    videoElement.src = URL.createObjectURL(file);
    if (dropZoneElement) dropZoneElement.style.display = "none";
    wrapperElement.style.display = "block";
    deleteBtnElement.style.display = "inline-block";
    clearCanvas(canvasElement);
}

function removeVideo(videoElement, dropZoneElement, wrapperElement, canvasElement, deleteBtnElement, fileInputs) {
    videoElement.pause();
    if (videoElement.src) URL.revokeObjectURL(videoElement.src);
    videoElement.removeAttribute('src');
    videoElement.load();

    clearCanvas(canvasElement);
    wrapperElement.style.display = "none";
    deleteBtnElement.style.display = "none";
    if (dropZoneElement) dropZoneElement.style.display = "flex";

    fileInputs.forEach(input => input.value = "");

    latestScores = null;
    statusBox.style.display = "none";
    statusBox.innerText = "";
    reportPanel.style.display = "none";
    savePanel.style.display = "none";
    saveStatus.innerText = "";
}

refDeleteBtn.addEventListener('click', () => {
    removeVideo(refVideo, refDropZone, refVideoWrapper, refCanvas, refDeleteBtn, [refVideoFile]);
});

userDeleteBtn.addEventListener('click', () => {
    removeVideo(userVideo, userDropZone, userVideoWrapper, userCanvas, userDeleteBtn, [userVideoFile, userCameraFile]);
});

function setupDropZone(dropZone, fileInput, videoElement, wrapperElement, canvasElement, deleteBtnElement) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            loadVideoToPlayer(e.dataTransfer.files[0], videoElement, dropZone, wrapperElement, canvasElement, deleteBtnElement);
        }
    });
}

setupDropZone(refDropZone, refVideoFile, refVideo, refVideoWrapper, refCanvas, refDeleteBtn);
setupDropZone(userDropZone, userVideoFile, userVideo, userVideoWrapper, userCanvas, userDeleteBtn);

refVideoFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], refVideo, refDropZone, refVideoWrapper, refCanvas, refDeleteBtn);
});
userVideoFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], userVideo, userDropZone, userVideoWrapper, userCanvas, userDeleteBtn);
});
userCameraFile.addEventListener('change', (e) => {
    if (e.target.files[0]) loadVideoToPlayer(e.target.files[0], userVideo, userDropZone, userVideoWrapper, userCanvas, userDeleteBtn);
});

refVideo.addEventListener('play', () => clearCanvas(refCanvas));
userVideo.addEventListener('play', () => clearCanvas(userCanvas));

existingGroupSelect.addEventListener('change', (e) => {
    groupNameInput.value = e.target.value ? e.target.value : "";
});

// =========================================================================
// [엄격 채점 알고리즘 엔진] 기하학적 각도 + 신체 비율 정규화 + 속도 동기화
// =========================================================================

function calculateAngle(a, b, c) {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.hypot(ab.x, ab.y);
    const magCB = Math.hypot(cb.x, cb.y);
    if (magAB === 0 || magCB === 0) return 0;
    const cosTheta = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
}

function dist(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function strictScoreFromDiff(diff, tolerance) {
    const ratio = diff / tolerance;
    const raw = 100 * Math.exp(-0.65 * ratio * ratio);
    return Math.max(0, Math.min(100, raw));
}

// 1. 손 / 상체 라인 채점
function evaluateHandScore(refKp, userKp) {
    const refScale = Math.max(dist(refKp[5], refKp[6]), 1);
    const userScale = Math.max(dist(userKp[5], userKp[6]), 1);

    const refLeftElbow = calculateAngle(refKp[5], refKp[7], refKp[9]);
    const userLeftElbow = calculateAngle(userKp[5], userKp[7], userKp[9]);
    const refRightElbow = calculateAngle(refKp[6], refKp[8], refKp[10]);
    const userRightElbow = calculateAngle(userKp[6], userKp[8], userKp[10]);

    const refLeftShoulder = calculateAngle(refKp[11], refKp[5], refKp[7]);
    const userLeftShoulder = calculateAngle(userKp[11], userKp[5], userKp[7]);
    const refRightShoulder = calculateAngle(refKp[12], refKp[6], refKp[8]);
    const userRightShoulder = calculateAngle(userKp[12], userKp[6], userKp[8]);

    const refLeftWristRel = { x: (refKp[9].x - refKp[5].x) / refScale, y: (refKp[9].y - refKp[5].y) / refScale };
    const userLeftWristRel = { x: (userKp[9].x - userKp[5].x) / userScale, y: (userKp[9].y - userKp[5].y) / userScale };
    const refRightWristRel = { x: (refKp[10].x - refKp[6].x) / refScale, y: (refKp[10].y - refKp[6].y) / refScale };
    const userRightWristRel = { x: (userKp[10].x - userKp[6].x) / userScale, y: (userKp[10].y - userKp[6].y) / userScale };

    const angleDiff = (
        Math.abs(refLeftElbow - userLeftElbow) +
        Math.abs(refRightElbow - userRightElbow) +
        Math.abs(refLeftShoulder - userLeftShoulder) +
        Math.abs(refRightShoulder - userRightShoulder)
    ) / 4;

    const posDiff = (
        dist(refLeftWristRel, userLeftWristRel) +
        dist(refRightWristRel, userRightWristRel)
    ) / 2;

    const angleScore = strictScoreFromDiff(angleDiff, 24);
    const posScore = strictScoreFromDiff(posDiff, 0.45);

    const minConf = Math.min(refKp[9].score, refKp[10].score, userKp[9].score, userKp[10].score);
    const confPenalty = minConf < 0.35 ? 0.75 : 1.0;

    return (angleScore * 0.6 + posScore * 0.4) * confPenalty;
}

// 2. 발 / 하체 스텝 채점
function evaluateFootScore(refKp, userKp) {
    const refHipWidth = Math.max(dist(refKp[11], refKp[12]), 1);
    const userHipWidth = Math.max(dist(userKp[11], userKp[12]), 1);

    const refLeftKnee = calculateAngle(refKp[11], refKp[13], refKp[15]);
    const userLeftKnee = calculateAngle(userKp[11], userKp[13], userKp[15]);
    const refRightKnee = calculateAngle(refKp[12], refKp[14], refKp[16]);
    const userRightKnee = calculateAngle(userKp[12], userKp[14], userKp[16]);

    const refStance = dist(refKp[15], refKp[16]) / refHipWidth;
    const userStance = dist(userKp[15], userKp[16]) / userHipWidth;

    const refHipCenter = { x: (refKp[11].x + refKp[12].x) / 2, y: (refKp[11].y + refKp[12].y) / 2 };
    const userHipCenter = { x: (userKp[11].x + userKp[12].x) / 2, y: (userKp[11].y + userKp[12].y) / 2 };

    const refLeftAnkleRel = { x: (refKp[15].x - refHipCenter.x) / refHipWidth, y: (refKp[15].y - refHipCenter.y) / refHipWidth };
    const userLeftAnkleRel = { x: (userKp[15].x - userHipCenter.x) / userHipWidth, y: (userKp[15].y - userHipCenter.y) / userHipWidth };
    const refRightAnkleRel = { x: (refKp[16].x - refHipCenter.x) / refHipWidth, y: (refKp[16].y - refHipCenter.y) / refHipWidth };
    const userRightAnkleRel = { x: (userKp[16].x - userHipCenter.x) / userHipWidth, y: (userKp[16].y - userHipCenter.y) / userHipWidth };

    const kneeDiff = (Math.abs(refLeftKnee - userLeftKnee) + Math.abs(refRightKnee - userRightKnee)) / 2;
    const stanceDiff = Math.abs(refStance - userStance);
    const anklePosDiff = (dist(refLeftAnkleRel, userLeftAnkleRel) + dist(refRightAnkleRel, userRightAnkleRel)) / 2;

    const kneeScore = strictScoreFromDiff(kneeDiff, 20);
    const stanceScore = strictScoreFromDiff(stanceDiff, 0.5);
    const posScore = strictScoreFromDiff(anklePosDiff, 0.55);

    const minConf = Math.min(userKp[15].score, userKp[16].score);
    const confPenalty = minConf < 0.35 ? 0.7 : 1.0;

    return (kneeScore * 0.4 + stanceScore * 0.3 + posScore * 0.3) * confPenalty;
}

// 3. 표정 / 시선 처리 채점
function evaluateFaceScore(refKp, userKp) {
    const refEyeCenter = { x: (refKp[1].x + refKp[2].x) / 2, y: (refKp[1].y + refKp[2].y) / 2 };
    const userEyeCenter = { x: (userKp[1].x + userKp[2].x) / 2, y: (userKp[1].y + userKp[2].y) / 2 };

    const refEarDist = Math.max(dist(refKp[3], refKp[4]), 1);
    const userEarDist = Math.max(dist(userKp[3], userKp[4]), 1);

    const refYaw = (dist(refKp[0], refKp[3]) - dist(refKp[0], refKp[4])) / refEarDist;
    const userYaw = (dist(userKp[0], userKp[3]) - dist(userKp[0], userKp[4])) / userEarDist;

    const refPitch = (refKp[0].y - refEyeCenter.y) / refEarDist;
    const userPitch = (userKp[0].y - userEyeCenter.y) / userEarDist;

    const refRoll = Math.atan2(refKp[2].y - refKp[1].y, refKp[2].x - refKp[1].x) * (180 / Math.PI);
    const userRoll = Math.atan2(userKp[2].y - userKp[1].y, userKp[2].x - userKp[1].x) * (180 / Math.PI);

    const yawScore = strictScoreFromDiff(Math.abs(refYaw - userYaw), 0.35);
    const pitchScore = strictScoreFromDiff(Math.abs(refPitch - userPitch), 0.25);
    const rollScore = strictScoreFromDiff(Math.abs(refRoll - userRoll), 15);

    const minConf = Math.min(userKp[0].score, userKp[1].score, userKp[2].score);
    const confPenalty = minConf < 0.4 ? 0.75 : 1.0;

    return (yawScore * 0.4 + pitchScore * 0.3 + rollScore * 0.3) * confPenalty;
}

// 4. 박자 / 리듬 동기화 채점
function evaluateRhythmScore(prevRefKp, currRefKp, prevUserKp, currUserKp) {
    if (!prevRefKp || !prevUserKp) return 80;

    const refScale = Math.max(dist(currRefKp[5], currRefKp[6]), 1);
    const userScale = Math.max(dist(currUserKp[5], currUserKp[6]), 1);

    const trackIndices = [9, 10, 15, 16];
    let refVelocity = 0;
    let userVelocity = 0;

    trackIndices.forEach(idx => {
        refVelocity += dist(prevRefKp[idx], currRefKp[idx]) / refScale;
        userVelocity += dist(prevUserKp[idx], currUserKp[idx]) / userScale;
    });

    const velocityDiff = Math.abs(refVelocity - userVelocity);
    return strictScoreFromDiff(velocityDiff, 0.55);
}

function generateDetailedAdvice(scores, weakMoments) {
    const advice = [];

    if (scores.total >= 88) {
        advice.push("<strong>[총평]</strong> 원곡 안무의 디테일과 박자 감각이 매우 뛰어납니다. 강약 조절(다이내믹)만 더 극대화하면 무대 완성도가 완벽해집니다.");
    } else if (scores.total >= 72) {
        advice.push("<strong>[총평]</strong> 전체적인 안무 흐름은 따라가고 있으나, 세부 관절 각도와 박자 타이밍에서 감점이 발생했습니다. 아래 취약 영역을 집중 교정해 보세요.");
    } else {
        advice.push("<strong>[총평]</strong> 아직 동작의 큰 틀을 흉내 내는 단계입니다. 0.75배속으로 구간을 쪼개어 관절의 정확한 각도와 멈춤 동작(아이솔레이션)부터 다시 연습하세요.");
    }

    if (scores.hand < 75) {
        advice.push(`<strong>[손 / 상체 교정 - ${scores.hand}점]</strong> 팔꿈치 굽힘 각도와 손목의 최종 도달 위치가 원본과 다릅니다. 팔을 뻗을 때 어깨가 함께 올라가지 않도록 고정하고, 손끝까지 텐션을 유지해 정확한 각도에서 동작을 끊어주세요.`);
    } else {
        advice.push(`<strong>[손 / 상체 양호 - ${scores.hand}점]</strong> 상체 라인과 팔 각도가 안정적입니다. 동작 전환 시 손목 스냅의 속도를 조금 더 높이면 훨씬 깔끔해집니다.`);
    }

    if (scores.foot < 75) {
        advice.push(`<strong>[발 / 스텝 교정 - ${scores.foot}점]</strong> 하체 무게중심이 높고 보폭이 원본보다 좁습니다. 무릎을 조금 더 굽혀 코어 중심을 낮추고, 스텝을 밟을 때 골반 너비 대비 보폭을 넓게 써서 안정감을 확보하세요.`);
    } else {
        advice.push(`<strong>[발 / 스텝 양호 - ${scores.foot}점]</strong> 하체 스텝과 무게중심 이동이 정확합니다. 발이 바닥에 닿는 순간 무릎 바운스를 살려주면 그루브가 더 살아납니다.`);
    }

    if (scores.rhythm < 75) {
        advice.push(`<strong>[박자 / 리듬 교정 - ${scores.rhythm}점]</strong> 원본 댄서의 가속도 타이밍과 박자가 엇갈리고 있습니다. 동작을 크게 하려다 박자가 반 박자씩 밀리는 경향이 있으므로, 정박에 정확히 동작이 '멈추는(Hit)' 타이밍에 집중하세요.`);
    } else {
        advice.push(`<strong>[박자 / 리듬 양호 - ${scores.rhythm}점]</strong> 음악의 강약과 관절의 가속 타이밍이 잘 동기화되어 있습니다.`);
    }

    if (scores.face < 75) {
        advice.push(`<strong>[표정 / 시선 교정 - ${scores.face}점]</strong> 동작을 신경 쓰느라 시선이 바닥이나 거울 한곳에만 고정되어 있습니다. 안무 방향에 맞춰 고개 각도(턱선)와 시선을 함께 전환해야 표정 연기와 무대 몰입도가 살아납니다.`);
    } else {
        advice.push(`<strong>[표정 / 시선 양호 - ${scores.face}점]</strong> 시선 처리와 고개 리듬이 안무의 흐름과 자연스럽게 어우러집니다.`);
    }

    if (weakMoments.length > 0) {
        weakMoments.sort((a, b) => a.score - b.score);
        const worst = weakMoments.slice(0, 2).map(m => `${m.time.toFixed(1)}초(${m.weakestArea})`).join(", ");
        advice.push(`<strong>[집중 복습 구간]</strong> 영상 중 <strong>${worst}</strong> 부근에서 원본과 가장 큰 자세 오차가 감지되었습니다. 해당 구간을 집중적으로 다시 확인해 보세요.`);
    }

    return advice;
}

function getGradeBadge(total) {
    if (total >= 92) return "S 등급 (데뷔조 수준)";
    if (total >= 82) return "A 등급 (우수)";
    if (total >= 70) return "B 등급 (양호)";
    if (total >= 55) return "C 등급 (보완 필요)";
    return "D 등급 (기초 연습 필요)";
}

function seekVideo(video, time) {
    return new Promise((resolve) => {
        video.currentTime = time;
        video.onseeked = () => resolve();
    });
}

// =========================================================================
// 1. 정밀 유사도 분석 실행
// =========================================================================
analyzeBtn.addEventListener('click', async () => {
    if (!refVideo.src || !userVideo.src) {
        alert("원본 영상과 내 연습 영상 파일을 모두 업로드해주세요!");
        return;
    }

    statusBox.style.display = "block";
    statusBox.innerText = "정밀 AI 관절 추적 모델 로딩 중...";
    analyzeBtn.disabled = true;
    reportPanel.style.display = "none";
    savePanel.style.display = "none";
    saveStatus.innerText = "";

    try {
        const detectorConfig = { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
        const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, detectorConfig);

        const duration = Math.min(refVideo.duration || 5, userVideo.duration || 5, 20);
        const step = 0.35;

        let sumHand = 0, sumFoot = 0, sumRhythm = 0, sumFace = 0;
        let validFrames = 0;
        let prevRefKp = null;
        let prevUserKp = null;
        const weakMoments = [];

        for (let t = 0; t < duration; t += step) {
            statusBox.innerText = `정밀 분석 진행 중... (${Math.round((t / duration) * 100)}%)`;

            await Promise.all([
                seekVideo(refVideo, t),
                seekVideo(userVideo, t)
            ]);

            const [refPose, userPose] = await Promise.all([
                detector.estimatePoses(refVideo),
                detector.estimatePoses(userVideo)
            ]);

            if (refPose.length > 0) {
                drawSkeleton(refPose[0].keypoints, refVideo, refCanvas, '#a78bfa', '#f472b6');
            } else {
                clearCanvas(refCanvas);
            }

            if (userPose.length > 0) {
                drawSkeleton(userPose[0].keypoints, userVideo, userCanvas, '#34d399', '#fbbf24');
            } else {
                clearCanvas(userCanvas);
            }

            if (refPose.length > 0 && userPose.length > 0) {
                const refKp = refPose[0].keypoints;
                const userKp = userPose[0].keypoints;

                const hScore = evaluateHandScore(refKp, userKp);
                const fScore = evaluateFootScore(refKp, userKp);
                const rScore = evaluateRhythmScore(prevRefKp, refKp, prevUserKp, userKp);
                const faceScore = evaluateFaceScore(refKp, userKp);

                sumHand += hScore;
                sumFoot += fScore;
                sumRhythm += rScore;
                sumFace += faceScore;
                validFrames++;

                const frameAvg = (hScore + fScore + rScore + faceScore) / 4;
                const areaMap = [
                    { name: "손/상체", val: hScore },
                    { name: "발/스텝", val: fScore },
                    { name: "박자", val: rScore },
                    { name: "표정/시선", val: faceScore }
                ].sort((a, b) => a.val - b.val);

                weakMoments.push({
                    time: t,
                    score: frameAvg,
                    weakestArea: areaMap[0].name
                });

                prevRefKp = refKp;
                prevUserKp = userKp;
            }
        }

        if (validFrames > 0) {
            const hand = Math.round(sumHand / validFrames);
            const foot = Math.round(sumFoot / validFrames);
            const rhythm = Math.round(sumRhythm / validFrames);
            const face = Math.round(sumFace / validFrames);

            const total = Math.round(hand * 0.30 + foot * 0.30 + rhythm * 0.25 + face * 0.15);

            latestScores = { total, hand, foot, rhythm, face };

            scoreTotalEl.innerText = `${total}점`;
            gradeBadgeEl.innerText = getGradeBadge(total);

            scoreHandEl.innerText = `${hand}점`;
            scoreFootEl.innerText = `${foot}점`;
            scoreRhythmEl.innerText = `${rhythm}점`;
            scoreFaceEl.innerText = `${face}점`;

            barHandEl.style.width = `${hand}%`;
            barFootEl.style.width = `${foot}%`;
            barRhythmEl.style.width = `${rhythm}%`;
            barFaceEl.style.width = `${face}%`;

            const adviceItems = generateDetailedAdvice(latestScores, weakMoments);
            adviceListEl.innerHTML = adviceItems.map(item => `<li>${item}</li>`).join("");

            statusBox.innerText = "정밀 분석이 완료되었습니다.";
            reportPanel.style.display = "block";
            savePanel.style.display = "block";
        } else {
            statusBox.innerText = "영상 속 인물의 전신을 감지하지 못했습니다. 조명이 밝고 전신이 나온 영상으로 다시 시도해 주세요.";
        }

    } catch (error) {
        console.error(error);
        statusBox.innerText = "분석 중 오류가 발생했습니다. 브라우저를 새로고침 후 다시 시도해 주세요.";
    } finally {
        analyzeBtn.disabled = false;
    }
});

// =========================================================================
// 2. 구글 스프레드시트 저장 / 수정 / 삭제 연동
// =========================================================================
saveBtn.addEventListener('click', async () => {
    const groupName = groupNameInput.value.trim();

    if (!groupName) {
        alert("곡(그룹) 이름을 선택하거나 입력해주세요!");
        return;
    }
    if (!latestScores) {
        alert("먼저 정밀 분석을 완료해주세요.");
        return;
    }

    saveBtn.disabled = true;
    saveStatus.innerText = "세부 점수를 구글 스프레드시트에 저장 중...";

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "save",
                groupName: groupName,
                ...latestScores
            })
        });

        saveStatus.innerText = `'${groupName}' (종합 ${latestScores.total}점) 세부 기록 저장 완료!`;
        setTimeout(fetchRecordsAndSetupDropdown, 1500);
    } catch (error) {
        console.error("저장 오류:", error);
        saveStatus.innerText = "저장 중 오류가 발생했습니다.";
    } finally {
        saveBtn.disabled = false;
    }
});

renameGroupBtn.addEventListener('click', async () => {
    const oldName = groupSelect.value;
    if (!oldName) return;

    const newName = prompt(`'${oldName}'의 새로운 곡 이름을 입력하세요:`, oldName);
    if (!newName || newName.trim() === "" || newName.trim() === oldName) return;

    renameGroupBtn.disabled = true;
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "rename",
                oldName: oldName,
                newName: newName.trim()
            })
        });
        alert(`곡 이름이 '${newName.trim()}'(으)로 변경되었습니다.`);
        setTimeout(fetchRecordsAndSetupDropdown, 1500);
    } catch (error) {
        alert("수정 중 오류가 발생했습니다.");
    } finally {
        renameGroupBtn.disabled = false;
    }
});

deleteGroupBtn.addEventListener('click', async () => {
    const targetGroup = groupSelect.value;
    if (!targetGroup) return;

    const confirmed = confirm(`'${targetGroup}'의 모든 연습 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`);
    if (!confirmed) return;

    deleteGroupBtn.disabled = true;
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "delete",
                groupName: targetGroup
            })
        });
        alert(`'${targetGroup}' 기록이 삭제되었습니다.`);
        groupSelect.value = "";
        groupManageActions.style.display = "none";
        if (scoreChart) scoreChart.destroy();
        setTimeout(fetchRecordsAndSetupDropdown, 1500);
    } catch (error) {
        alert("삭제 중 오류가 발생했습니다.");
    } finally {
        deleteGroupBtn.disabled = false;
    }
});

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
            groupManageActions.style.display = "flex";
            renderChart(previousSelection);
        } else {
            groupManageActions.style.display = "none";
        }
    } catch (error) {
        console.error("기록 불러오기 실패:", error);
    }
}

// =========================================================================
// 3. 크기를 키우고 작은 점으로 다듬은 다중 세부 지표 성장 그래프 (Chart.js)
// =========================================================================
function renderChart(selectedGroup) {
    if (!selectedGroup) {
        groupManageActions.style.display = "none";
        if (scoreChart) scoreChart.destroy();
        return;
    }

    groupManageActions.style.display = "flex";
    const filtered = allRecords.filter(r => r.groupName === selectedGroup);
    const labels = filtered.map(r => r.date);

    const activeMetrics = Array.from(metricToggles)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    const datasetConfig = {
        total: {
            label: "종합 점수",
            data: filtered.map(r => r.total),
            borderColor: "#a78bfa",
            backgroundColor: "rgba(167, 139, 250, 0.12)",
            borderWidth: 2.5,
            fill: true
        },
        hand: {
            label: "손 / 상체",
            data: filtered.map(r => r.hand),
            borderColor: "#38bdf8",
            backgroundColor: "transparent",
            borderWidth: 2,
            fill: false
        },
        foot: {
            label: "발 / 스텝",
            data: filtered.map(r => r.foot),
            borderColor: "#34d399",
            backgroundColor: "transparent",
            borderWidth: 2,
            fill: false
        },
        rhythm: {
            label: "박자 / 리듬",
            data: filtered.map(r => r.rhythm),
            borderColor: "#fbbf24",
            backgroundColor: "transparent",
            borderWidth: 2,
            fill: false
        },
        face: {
            label: "표정 / 시선",
            data: filtered.map(r => r.face),
            borderColor: "#f472b6",
            backgroundColor: "transparent",
            borderWidth: 2,
            fill: false
        }
    };

    const datasets = activeMetrics.map(key => ({
        ...datasetConfig[key],
        tension: 0.2,
        pointRadius: 2.5,       // 평상시 깔끔한 작은 점
        pointHoverRadius: 5,    // 마우스/터치 시 부드럽게 확대
        pointBorderWidth: 1,
        pointBackgroundColor: datasetConfig[key].borderColor
    }));

    if (scoreChart) scoreChart.destroy();

    scoreChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false, // 컨테이너 높이에 맞춰 크게 렌더링
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e2e8f0',
                        padding: 16,
                        font: { size: 13 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    titleColor: '#c4b5fd',
                    bodyColor: '#f8fafc',
                    borderColor: '#475569',
                    borderWidth: 1,
                    padding: 10
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#94a3b8',
                        maxRotation: 30,
                        font: { size: 11 }
                    },
                    grid: { color: 'rgba(51, 65, 85, 0.4)' }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: '#94a3b8',
                        stepSize: 20,
                        font: { size: 12 }
                    },
                    grid: { color: 'rgba(51, 65, 85, 0.6)' }
                }
            }
        }
    });
}

groupSelect.addEventListener('change', (e) => renderChart(e.target.value));
metricToggles.forEach(cb => {
    cb.addEventListener('change', () => {
        if (groupSelect.value) renderChart(groupSelect.value);
    });
});

fetchRecordsAndSetupDropdown();